import { FileSafetyStatus, FileScanJobStatus } from '@prisma/client';
import { FileScanService } from '../src/modules/materials/file-scan.service';

class SharedPrismaMock {
  job: any = {
    id: 'j1',
    materialId: 'm1',
    fileKey: '2026-05-16/file.txt',
    status: FileScanJobStatus.PENDING,
    attempts: 0,
    lastError: null,
    scheduledAt: new Date(Date.now() - 1000),
    nextRunAt: new Date(Date.now() - 1000),
    lockedBy: null,
    lockedAt: null,
    failedAt: null,
    updatedAt: new Date(Date.now() - 1000),
  };
  scans: string[] = [];

  fileScanJob = {
    findMany: async () => (this.job ? [{ ...this.job }] : []),
    updateMany: async ({ where, data }: any) => {
      if (!this.job || where.id !== this.job.id) return { count: 0 };
      const isPending = this.job.status === FileScanJobStatus.PENDING && this.job.nextRunAt <= where.OR[0].nextRunAt.lte;
      if (!isPending) return { count: 0 };
      this.job = { ...this.job, ...data, updatedAt: new Date() };
      return { count: 1 };
    },
    findUnique: async ({ where }: any) => (this.job?.id === where.id ? { ...this.job } : null),
    update: async ({ data }: any) => {
      this.job = { ...this.job, ...data, updatedAt: new Date() };
      return this.job;
    },
    upsert: async () => undefined,
  };

  material = {
    update: async ({ where, data }: any) => {
      if (data.fileSafetyStatus === FileSafetyStatus.SCANNING) this.scans.push(where.id);
    },
  };

  $transaction<T>(task: (tx: this) => Promise<T>): Promise<T> {
    return task(this);
  }
}

class MinioMock {
  getSignedDownloadUrl() { return 'data:text/plain,hello'; }
}

async function run() {
  const prisma = new SharedPrismaMock();
  const scannerA = new FileScanService(prisma as any, new MinioMock() as any);
  const scannerB = new FileScanService(prisma as any, new MinioMock() as any);

  await Promise.all([scannerA.runPendingScans(), scannerB.runPendingScans()]);

  if (prisma.scans.length !== 1) {
    throw new Error(`expected exactly one scanner to claim the job, got ${prisma.scans.length}`);
  }
  if (prisma.job.status !== FileScanJobStatus.DONE) throw new Error(`expected DONE, got ${prisma.job.status}`);

  console.log('min-file-scan-claim-concurrency-check passed');
}

run().catch((error) => { console.error(error); process.exit(1); });
