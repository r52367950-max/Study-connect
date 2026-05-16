import { Injectable, Logger } from '@nestjs/common';
import { FileSafetyStatus } from '@prisma/client';
import { PrismaService } from '../../infra';
import { UploadFileInput } from './file-upload.type';
import { assertUploadFileSecurity, UploadSecurityStatus } from './upload-security.util';

const DEFAULT_SCAN_DELAY_MS = 500;
const DEFAULT_SCAN_TIMEOUT_MS = 15_000;

@Injectable()
export class FileScanService {
  private readonly logger = new Logger(FileScanService.name);

  constructor(private readonly prisma: PrismaService) {}

  enqueueScan(materialId: string, file: UploadFileInput): void {
    this.audit('FILE_SCAN_ENQUEUED', {
      materialId,
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    });

    setTimeout(() => {
      void this.runScan(materialId, file);
    }, this.getScanDelayMs());
  }

  private async runScan(materialId: string, file: UploadFileInput): Promise<void> {
    await this.updateScanStatus(materialId, FileSafetyStatus.SCANNING);

    try {
      const status = await this.executeWithTimeout(async () => {
        assertUploadFileSecurity(file);
        return FileSafetyStatus.PASSED;
      });

      await this.updateScanStatus(materialId, status);
      this.audit('FILE_SCAN_COMPLETED', {
        materialId,
        result: status,
      });
    } catch (error) {
      const timeout = error instanceof Error && error.message === 'SCAN_TIMEOUT';
      const status: UploadSecurityStatus = timeout ? FileSafetyStatus.TIMEOUT : FileSafetyStatus.FAILED;

      await this.updateScanStatus(materialId, status);

      this.logger.warn(
        JSON.stringify({
          event: 'SECURITY_ALERT_FILE_SCAN_FAILED',
          materialId,
          result: status,
          reason: timeout ? 'scan timeout' : 'scan validation failed',
        }),
      );

      if (!timeout) {
        this.logger.debug(error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async executeWithTimeout<T>(task: () => Promise<T> | T): Promise<T> {
    const timeoutMs = this.getScanTimeoutMs();

    return await Promise.race([
      Promise.resolve().then(task),
      new Promise<T>((_resolve, reject) => {
        setTimeout(() => reject(new Error('SCAN_TIMEOUT')), timeoutMs);
      }),
    ]);
  }

  private async updateScanStatus(materialId: string, status: UploadSecurityStatus): Promise<void> {
    await this.prisma.material.update({
      where: { id: materialId },
      data: {
        fileSafetyStatus: status,
      },
    });
  }

  private audit(event: string, payload: Record<string, unknown>): void {
    this.logger.log(
      JSON.stringify({
        event,
        ...payload,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  private getScanDelayMs(): number {
    const value = Number(process.env.FILE_SCAN_DELAY_MS ?? String(DEFAULT_SCAN_DELAY_MS));
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_SCAN_DELAY_MS;
  }

  private getScanTimeoutMs(): number {
    const value = Number(process.env.FILE_SCAN_TIMEOUT_MS ?? String(DEFAULT_SCAN_TIMEOUT_MS));
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_SCAN_TIMEOUT_MS;
  }
}
