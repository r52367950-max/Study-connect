import { FileSafetyStatus, FileScanJobStatus } from '@prisma/client';
import { FileScanService } from '../src/modules/materials/file-scan.service';

class PrismaMock {
  job: any = null;
  materialStatus: string | null = null;
  fileScanJob = {
    upsert: async ({ create }: any) => { this.job = { id: 'j1', attempts: 0, nextRunAt: new Date(), ...create }; },
    findMany: async () => (this.job ? [this.job] : []),
    updateMany: async ({ data }: any) => { this.job = { ...this.job, ...data }; return { count: 1 }; },
    findUnique: async () => this.job,
    update: async ({ data }: any) => { this.job = { ...this.job, ...data }; return this.job; },
  };
  $transaction<T>(task: (tx: this) => Promise<T>): Promise<T> { return task(this); }
  material = { update: async ({ data }: any) => { this.materialStatus = data.fileSafetyStatus; } };
}

class MinioMock {
  getSignedDownloadUrl() { return 'data:text/plain,hello'; }
}

async function run() {
  const prisma = new PrismaMock();
  const service = new FileScanService(prisma as any, new MinioMock() as any);
  await service.enqueueScan('m1', '2026-05-16/file.txt');
  if (!prisma.job || prisma.job.status !== FileScanJobStatus.PENDING) throw new Error('job not enqueued');
  await service.runPendingScans();
  if (prisma.materialStatus !== FileSafetyStatus.PASSED) throw new Error('material not scanned to PASSED');
  if (prisma.job.status !== FileScanJobStatus.DONE) throw new Error('job not DONE');
  console.log('min-file-scan-async-check passed');
}

run().catch((e) => { console.error(e); process.exit(1); });
