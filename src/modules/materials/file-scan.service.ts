import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FileSafetyStatus, FileScanJobStatus } from '@prisma/client';
import { MinioService, PrismaService } from '../../infra';
import { assertUploadFileSecurity, UploadSecurityStatus } from './upload-security.util';

const DEFAULT_SCAN_INTERVAL_MS = 30_000;
const DEFAULT_SCAN_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

@Injectable()
export class FileScanService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FileScanService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  // B4: reentrance guard — skip tick if a previous batch hasn't finished yet
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.runPendingScans();
    }, DEFAULT_SCAN_INTERVAL_MS);
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
      create: { materialId, fileKey, status: FileScanJobStatus.PENDING },
      update: { fileKey, status: FileScanJobStatus.PENDING, scheduledAt: new Date(), lastError: null },
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
      const jobs = await this.prisma.fileScanJob.findMany({
        where: { status: FileScanJobStatus.PENDING, scheduledAt: { lte: new Date() } },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
      });

      for (const job of jobs) {
        await this.prisma.fileScanJob.update({ where: { id: job.id }, data: { status: FileScanJobStatus.RUNNING } });
        await this.updateScanStatus(job.materialId, FileSafetyStatus.SCANNING);
        try {
          const payload = await this.fetchObject(job.fileKey);
          const status = await this.executeWithTimeout(async () => {
            assertUploadFileSecurity({
              originalname: job.fileKey.split('/').pop() ?? 'file',
              mimetype: this.inferMime(job.fileKey),
              size: payload.length,
              buffer: payload,
            });
            return FileSafetyStatus.PASSED;
          });
          await this.updateScanStatus(job.materialId, status);
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
              status: terminal ? FileScanJobStatus.FAILED : FileScanJobStatus.PENDING,
              lastError: message,
              scheduledAt: new Date(Date.now() + (terminal ? 0 : this.retryBackoffMs(attempts))),
            },
          });
          this.logger.warn({ event: 'FILE_SCAN_FAILED', materialId: job.materialId, attempts, terminal, error: message });
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async fetchObject(key: string): Promise<Buffer> {
    const response = await fetch(this.minioService.getSignedDownloadUrl(key));
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

  private async updateScanStatus(materialId: string, status: UploadSecurityStatus): Promise<void> {
    await this.prisma.material.update({ where: { id: materialId }, data: { fileSafetyStatus: status } });
  }

  private getScanTimeoutMs(): number {
    const value = Number(process.env.FILE_SCAN_TIMEOUT_MS ?? String(DEFAULT_SCAN_TIMEOUT_MS));
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_SCAN_TIMEOUT_MS;
  }
}
