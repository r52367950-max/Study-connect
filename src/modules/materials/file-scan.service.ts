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
    if (!(this.prisma as any).fileScanJob?.findMany) {
      return;
    }
    const jobs = await this.prisma.fileScanJob.findMany({
      where: { status: FileScanJobStatus.PENDING },
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
        const timeout = error instanceof Error && error.message === 'SCAN_TIMEOUT';
        const failedStatus: UploadSecurityStatus = timeout ? FileSafetyStatus.TIMEOUT : FileSafetyStatus.FAILED;
        const terminal = attempts >= MAX_ATTEMPTS;
        await this.updateScanStatus(job.materialId, terminal ? FileSafetyStatus.TIMEOUT : failedStatus);
        await this.prisma.fileScanJob.update({
          where: { id: job.id },
          data: {
            attempts,
            status: terminal ? FileScanJobStatus.FAILED : FileScanJobStatus.PENDING,
            lastError: error instanceof Error ? error.message : String(error),
            scheduledAt: new Date(),
          },
        });
        this.logger.warn({ event: 'FILE_SCAN_FAILED', materialId: job.materialId, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  private async fetchObject(key: string): Promise<Buffer> {
    const response = await fetch(this.minioService.getSignedDownloadUrl(key));
    if (!response.ok) throw new Error(`MINIO_FETCH_FAILED:${response.status}`);
    const data = await response.arrayBuffer();
    return Buffer.from(data);
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
    return await Promise.race([Promise.resolve().then(task), new Promise<T>((_, r) => setTimeout(() => r(new Error('SCAN_TIMEOUT')), timeoutMs))]);
  }

  private async updateScanStatus(materialId: string, status: UploadSecurityStatus): Promise<void> {
    await this.prisma.material.update({ where: { id: materialId }, data: { fileSafetyStatus: status } });
  }

  private getScanTimeoutMs(): number {
    const value = Number(process.env.FILE_SCAN_TIMEOUT_MS ?? String(DEFAULT_SCAN_TIMEOUT_MS));
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_SCAN_TIMEOUT_MS;
  }
}
