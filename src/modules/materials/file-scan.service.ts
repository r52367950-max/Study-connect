import { Injectable, Logger, OnModuleDestroy, OnModuleInit, UnprocessableEntityException } from '@nestjs/common';
import { Socket } from 'node:net';
import { FileSafetyStatus, FileScanJobStatus } from '@prisma/client';
import { MinioService, PrismaService } from '../../infra';
import { assertUploadFileSecurity, UploadSecurityStatus } from './upload-security.util';

const DEFAULT_SCAN_INTERVAL_MS = 30_000;
const DEFAULT_SCAN_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
// A RUNNING job untouched for this long can only be a crashed batch (a healthy scan
// finishes within DEFAULT_SCAN_TIMEOUT_MS); re-queue it on the next tick.
const STALE_RUNNING_MS = 10 * 60_000;
const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export type FileScanVerdict = 'PASSED' | 'FAILED';

export type FileScanPayload = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type FileScanResult = {
  verdict: FileScanVerdict;
  engine: string;
  engineVersion?: string;
  signature?: string;
  riskReasons: string[];
  scanDurationMs: number;
  rawSummary?: unknown;
};

export interface FileScanner {
  scan(file: FileScanPayload): Promise<FileScanResult>;
}

class LocalPolicyFileScanner implements FileScanner {
  async scan(file: FileScanPayload): Promise<FileScanResult> {
    const started = Date.now();
    try {
      assertUploadFileSecurity(file);
      const body = file.buffer.toString('utf8');
      if (body.includes(EICAR_SIGNATURE)) {
        return {
          verdict: 'FAILED',
          engine: 'local-policy',
          engineVersion: 'upload-security-v1',
          signature: 'EICAR-Test-File',
          riskReasons: ['EICAR_TEST_SIGNATURE'],
          scanDurationMs: Date.now() - started,
          rawSummary: { source: 'local-policy', match: 'EICAR_TEST_SIGNATURE' },
        };
      }
      return {
        verdict: 'PASSED',
        engine: 'local-policy',
        engineVersion: 'upload-security-v1',
        riskReasons: [],
        scanDurationMs: Date.now() - started,
        rawSummary: { source: 'local-policy', status: 'PASSED' },
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        verdict: 'FAILED',
        engine: 'local-policy',
        engineVersion: 'upload-security-v1',
        riskReasons: [reason],
        scanDurationMs: Date.now() - started,
        rawSummary: { source: 'local-policy', error: reason },
      };
    }
  }
}

class CommercialAvApiFileScanner implements FileScanner {
  constructor(private readonly endpoint: string, private readonly token?: string) {}

  async scan(file: FileScanPayload): Promise<FileScanResult> {
    const started = Date.now();
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': file.mimetype,
        'x-file-name': encodeURIComponent(file.originalname),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: new Uint8Array(file.buffer),
    });
    if (!response.ok) throw new Error(`AV_API_FAILED:${response.status}`);
    const raw = (await response.json()) as Record<string, unknown>;
    return normalizeRemoteScanResult(raw, 'commercial-av-api', Date.now() - started);
  }
}

class CdrServiceFileScanner implements FileScanner {
  constructor(private readonly endpoint: string, private readonly token?: string) {}

  async scan(file: FileScanPayload): Promise<FileScanResult> {
    const started = Date.now();
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': file.mimetype,
        'x-file-name': encodeURIComponent(file.originalname),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: new Uint8Array(file.buffer),
    });
    if (!response.ok) throw new Error(`CDR_SERVICE_FAILED:${response.status}`);
    const raw = (await response.json()) as Record<string, unknown>;
    return normalizeRemoteScanResult(raw, 'cdr-service', Date.now() - started);
  }
}

class ClamAvFileScanner implements FileScanner {
  constructor(private readonly host: string, private readonly port: number) {}

  async scan(file: FileScanPayload): Promise<FileScanResult> {
    const started = Date.now();
    const raw = await this.scanBuffer(file.buffer);
    const found = raw.includes('FOUND');
    const signature = found ? raw.split(':').pop()?.replace('FOUND', '').trim() : undefined;
    return {
      verdict: found ? 'FAILED' : 'PASSED',
      engine: 'clamav',
      signature,
      riskReasons: found ? ['MALWARE_SIGNATURE'] : [],
      scanDurationMs: Date.now() - started,
      rawSummary: raw,
    };
  }

  private scanBuffer(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const chunks: Buffer[] = [];
      socket.setTimeout(Number(process.env.FILE_SCAN_TIMEOUT_MS ?? String(DEFAULT_SCAN_TIMEOUT_MS)));
      socket.once('error', reject);
      socket.once('timeout', () => { socket.destroy(); reject(new Error('SCAN_TIMEOUT')); });
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.once('close', () => resolve(Buffer.concat(chunks).toString('utf8').trim()));
      socket.connect(this.port, this.host, () => {
        socket.write('zINSTREAM\0');
        const sizePrefix = Buffer.alloc(4);
        sizePrefix.writeUInt32BE(buffer.length, 0);
        socket.write(sizePrefix);
        socket.write(buffer);
        socket.write(Buffer.from([0, 0, 0, 0]));
      });
    });
  }
}

function normalizeRemoteScanResult(raw: Record<string, unknown>, defaultEngine: string, duration: number): FileScanResult {
  const verdict = String(raw.verdict ?? raw.status ?? '').toUpperCase() === 'PASSED' || raw.clean === true ? 'PASSED' : 'FAILED';
  const riskReasons = Array.isArray(raw.riskReasons) ? raw.riskReasons.map(String) : (raw.reason ? [String(raw.reason)] : []);
  return {
    verdict,
    engine: String(raw.engine ?? defaultEngine),
    engineVersion: raw.engineVersion ? String(raw.engineVersion) : undefined,
    signature: raw.signature ? String(raw.signature) : undefined,
    riskReasons,
    scanDurationMs: duration,
    rawSummary: raw,
  };
}

@Injectable()
export class FileScanService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FileScanService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly scannerId = process.env.FILE_SCAN_INSTANCE_ID ?? `${process.pid}-${Math.random().toString(36).slice(2)}`;
  // B4: reentrance guard — skip tick if a previous batch hasn't finished yet
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
    private readonly scanner: FileScanner = createFileScannerFromEnv(),
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.runPendingScans();
    }, DEFAULT_SCAN_INTERVAL_MS);
    // Like RateLimitService's sweeper: don't let the poll loop keep the process alive.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async enqueueScan(materialId: string, fileKey: string): Promise<void> {
    if (!(this.prisma as any).fileScanJob?.upsert) {
      return;
    }
    await this.prisma.fileScanJob.upsert({
      where: { materialId },
      create: { materialId, fileKey, status: FileScanJobStatus.PENDING, nextRunAt: new Date() },
      update: {
        fileKey,
        status: FileScanJobStatus.PENDING,
        attempts: 0,
        scheduledAt: new Date(),
        nextRunAt: new Date(),
        lockedBy: null,
        lockedAt: null,
        failedAt: null,
        lastError: null,
      },
    });
  }

  async runPendingScans(): Promise<void> {
    // B4: skip tick if previous batch is still running to prevent double-processing
    if (this.isRunning) return;
    if (!(this.prisma as any).fileScanJob?.findMany) {
      return;
    }
    this.isRunning = true;
    try {
      const jobs = await this.claimPendingJobs(5);

      for (const job of jobs) {
        await this.updateScanStatus(job.materialId, FileSafetyStatus.SCANNING);
        try {
          const payload = await this.fetchObject(job.fileKey);
          const report = await this.executeWithTimeout(() =>
            this.scanner.scan({
              originalname: job.fileKey.split('/').pop() ?? 'file',
              mimetype: this.inferMime(job.fileKey),
              size: payload.length,
              buffer: payload,
            }),
          );
          await this.persistScanReport(job.id, job.materialId, report);
          if (report.verdict === 'FAILED') {
            throw new UnprocessableEntityException(report.riskReasons[0] ?? report.signature ?? 'FILE_SCAN_FAILED');
          }
          await this.updateScanStatus(job.materialId, FileSafetyStatus.PASSED);
          await this.prisma.fileScanJob.update({ where: { id: job.id }, data: { status: FileScanJobStatus.DONE, lastError: null } });
        } catch (error) {
          const attempts = job.attempts + 1;
          const message = error instanceof Error ? error.message : String(error);
          // An illegal-file rejection is deterministic — retrying can't change the
          // verdict, so fail terminally as FAILED (correct: it stays 404). Timeouts
          // and object-store fetch errors are transient and get a bounded retry.
          // FILE_TOO_LARGE is also deterministic — the object won't shrink on retry.
          const transient = message === 'SCAN_TIMEOUT' || message.startsWith('MINIO_FETCH_FAILED');
          const terminal = !transient || attempts >= MAX_ATTEMPTS;

          let materialStatus: UploadSecurityStatus;
          if (!transient) {
            materialStatus = FileSafetyStatus.FAILED;
          } else if (terminal) {
            materialStatus = FileSafetyStatus.TIMEOUT;
          } else {
            materialStatus = FileSafetyStatus.SCANNING;
          }
          await this.updateScanStatus(job.materialId, materialStatus);

          await this.prisma.fileScanJob.update({
            where: { id: job.id },
            data: {
              attempts,
              status: terminal ? FileScanJobStatus.DEAD_LETTER : FileScanJobStatus.PENDING,
              lastError: message,
              scheduledAt: new Date(Date.now() + (terminal ? 0 : this.retryBackoffMs(attempts))),
              nextRunAt: new Date(Date.now() + (terminal ? 0 : this.retryBackoffMs(attempts))),
              lockedBy: terminal ? this.scannerId : null,
              lockedAt: terminal ? new Date() : null,
              failedAt: terminal ? new Date() : null,
            },
          });
          this.logger.warn({ event: 'FILE_SCAN_FAILED', materialId: job.materialId, attempts, terminal, error: message });
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async claimPendingJobs(take: number): Promise<FileScanJob[]> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_RUNNING_MS);
    const candidates = await this.prisma.fileScanJob.findMany({
      where: {
        OR: [
          { status: FileScanJobStatus.PENDING, nextRunAt: { lte: now } },
          { status: FileScanJobStatus.RUNNING, lockedAt: { lt: staleBefore } },
          { status: FileScanJobStatus.RUNNING, lockedAt: null, updatedAt: { lt: staleBefore } },
        ],
      },
      orderBy: { nextRunAt: 'asc' },
      take,
    });

    const claimed: FileScanJob[] = [];
    for (const candidate of candidates) {
      const result = await this.prisma.$transaction(async (tx) => {
        const update = await tx.fileScanJob.updateMany({
          where: {
            id: candidate.id,
            OR: [
              { status: FileScanJobStatus.PENDING, nextRunAt: { lte: now } },
              { status: FileScanJobStatus.RUNNING, lockedAt: { lt: staleBefore } },
              { status: FileScanJobStatus.RUNNING, lockedAt: null, updatedAt: { lt: staleBefore } },
            ],
          },
          data: { status: FileScanJobStatus.RUNNING, lockedBy: this.scannerId, lockedAt: now },
        });
        if (update.count !== 1) return null;
        return tx.fileScanJob.findUnique({ where: { id: candidate.id } });
      });
      if (result) claimed.push(result);
    }

    return claimed;
  }

  private async fetchObject(key: string): Promise<Buffer> {
    let response: Response;
    try {
      response = await fetch(this.minioService.getSignedDownloadUrl(key));
    } catch {
      // fetch() rejects with a generic "fetch failed" on connection-level errors. Map it
      // into the MINIO_FETCH_FAILED family so a network blip gets the bounded transient
      // retry instead of terminally marking the material FAILED.
      throw new Error('MINIO_FETCH_FAILED:NETWORK');
    }
    if (!response.ok) throw new Error(`MINIO_FETCH_FAILED:${response.status}`);

    // B4: enforce size cap before reading the full body to avoid OOM on large objects
    const maxBytes = this.getMaxUploadBytes();
    const contentLength = Number(response.headers.get('content-length') ?? NaN);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      this.logger.warn({ event: 'FILE_SCAN_SIZE_EXCEEDED', key, contentLength, maxBytes });
      throw new Error('FILE_TOO_LARGE');
    }

    const data = await response.arrayBuffer();
    if (data.byteLength > maxBytes) {
      this.logger.warn({ event: 'FILE_SCAN_SIZE_EXCEEDED', key, byteLength: data.byteLength, maxBytes });
      throw new Error('FILE_TOO_LARGE');
    }
    return Buffer.from(data);
  }

  private getMaxUploadBytes(): number {
    const mb = Number(process.env.MAX_UPLOAD_SIZE_MB ?? '50');
    return (Number.isFinite(mb) && mb > 0 ? mb : 50) * 1024 * 1024;
  }

  private inferMime(key: string): string {
    const ext = key.toLowerCase().split('.').pop();
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (ext === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if (ext === 'zip') return 'application/zip';
    return 'text/plain';
  }

  private async executeWithTimeout<T>(task: () => Promise<T> | T): Promise<T> {
    const timeoutMs = this.getScanTimeoutMs();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(task),
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error('SCAN_TIMEOUT')), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private retryBackoffMs(attempts: number): number {
    // Exponential backoff between scan retries, capped at 5 minutes.
    return Math.min(DEFAULT_SCAN_INTERVAL_MS * 2 ** Math.max(attempts - 1, 0), 5 * 60_000);
  }

  private async persistScanReport(jobId: string, materialId: string, report: FileScanResult): Promise<void> {
    const data = {
      jobId,
      materialId,
      verdict: report.verdict,
      engine: report.engine,
      engineVersion: report.engineVersion,
      signature: report.signature,
      riskReasons: report.riskReasons,
      scanDurationMs: report.scanDurationMs,
      rawSummary: report.rawSummary ?? {},
    };
    const client = (this.prisma as any).fileScanReport;
    if (client?.create) {
      await client.create({ data });
    }
  }

  private async updateScanStatus(materialId: string, status: UploadSecurityStatus): Promise<void> {
    await this.prisma.material.update({ where: { id: materialId }, data: { fileSafetyStatus: status } });
  }

  private getScanTimeoutMs(): number {
    const value = Number(process.env.FILE_SCAN_TIMEOUT_MS ?? String(DEFAULT_SCAN_TIMEOUT_MS));
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_SCAN_TIMEOUT_MS;
  }
}

export function createFileScannerFromEnv(): FileScanner {
  const provider = (process.env.FILE_SCANNER_PROVIDER ?? '').toLowerCase();
  if (provider === 'clamav') {
    return new ClamAvFileScanner(process.env.CLAMAV_HOST ?? '127.0.0.1', Number(process.env.CLAMAV_PORT ?? '3310'));
  }
  if (provider === 'commercial-av' && process.env.FILE_SCANNER_API_URL) {
    return new CommercialAvApiFileScanner(process.env.FILE_SCANNER_API_URL, process.env.FILE_SCANNER_API_TOKEN);
  }
  if (provider === 'cdr' && process.env.CDR_SERVICE_URL) {
    return new CdrServiceFileScanner(process.env.CDR_SERVICE_URL, process.env.CDR_SERVICE_TOKEN);
  }
  return new LocalPolicyFileScanner();
}
