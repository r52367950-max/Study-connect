import { FileSafetyStatus, FileScanJobStatus } from '@prisma/client';
import { FileScanResult, FileScanService, FileScanner } from '../src/modules/materials/file-scan.service';

class PrismaMock {
  job: any = null;
  materialStatus: string | null = null;
  reports: any[] = [];
  fileScanJob = {
    upsert: async ({ create }: any) => { this.job = { id: 'j1', attempts: 0, updatedAt: new Date(), ...create }; },
    findMany: async () => (this.job ? [this.job] : []),
    update: async ({ data }: any) => { this.job = { ...this.job, ...data, updatedAt: new Date() }; return this.job; },
    // claimPendingJobs() (concurrency-hardened) claims each candidate with a conditional
    // updateMany then re-reads via findUnique. This single-job mock treats the tracked job as
    // always due when PENDING/RUNNING (mirroring findMany above); the time-gated claim predicates
    // are covered by min-file-scan-claim-concurrency-check.
    updateMany: async ({ where, data }: any) => {
      const job = this.job;
      if (!job || job.id !== where.id) return { count: 0 };
      const claimable = job.status === FileScanJobStatus.PENDING || job.status === FileScanJobStatus.RUNNING;
      if (!claimable) return { count: 0 };
      this.job = { ...job, ...data, updatedAt: new Date() };
      return { count: 1 };
    },
    findUnique: async ({ where }: any) => (this.job && this.job.id === where.id ? this.job : null),
  };
  fileScanReport = {
    create: async ({ data }: any) => { this.reports.push({ id: `r${this.reports.length + 1}`, ...data }); return this.reports.at(-1); },
  };
  $transaction<T>(task: (tx: this) => Promise<T>): Promise<T> { return task(this); }
  material = { update: async ({ data }: any) => { this.materialStatus = data.fileSafetyStatus; } };
}

class MinioMock {
  constructor(private readonly body: string) {}
  getSignedDownloadUrl() { return `data:text/plain,${encodeURIComponent(this.body)}`; }
}

class StaticScanner implements FileScanner {
  constructor(private readonly result: FileScanResult) {}
  async scan(): Promise<FileScanResult> { return this.result; }
}

class HangingScanner implements FileScanner {
  async scan(): Promise<FileScanResult> { return new Promise(() => undefined); }
}

const passedReport: FileScanResult = {
  verdict: 'PASSED',
  engine: 'test-scanner',
  engineVersion: '1.0.0',
  riskReasons: [],
  scanDurationMs: 1,
  rawSummary: { clean: true },
};

const eicarReport: FileScanResult = {
  verdict: 'FAILED',
  engine: 'test-scanner',
  engineVersion: '1.0.0',
  signature: 'EICAR-Test-File',
  riskReasons: ['EICAR_TEST_SIGNATURE'],
  scanDurationMs: 1,
  rawSummary: { match: 'EICAR_TEST_SIGNATURE' },
};

async function assertSafeFilePasses() {
  const prisma = new PrismaMock();
  const service = new FileScanService(prisma as any, new MinioMock('hello') as any, new StaticScanner(passedReport));
  await service.enqueueScan('m1', '2026-05-16/file.txt');
  if (!prisma.job || prisma.job.status !== FileScanJobStatus.PENDING) throw new Error('job not enqueued');
  await service.runPendingScans();
  if ((prisma.materialStatus as FileSafetyStatus | null) !== FileSafetyStatus.PASSED) throw new Error('safe material not scanned to PASSED');
  if (prisma.job.status !== FileScanJobStatus.DONE) throw new Error('safe job not DONE');
  if (prisma.reports[0]?.engine !== 'test-scanner') throw new Error('safe scan report not persisted');
}

async function assertEicarFileFails() {
  const prisma = new PrismaMock();
  const service = new FileScanService(prisma as any, new MinioMock('eicar') as any, new StaticScanner(eicarReport));
  await service.enqueueScan('m2', '2026-05-16/eicar.txt');
  await service.runPendingScans();
  if ((prisma.materialStatus as FileSafetyStatus | null) !== FileSafetyStatus.FAILED) throw new Error('EICAR material not marked FAILED');
  if (prisma.job.status !== FileScanJobStatus.DEAD_LETTER) throw new Error('EICAR job not DEAD_LETTER');
  if (prisma.reports[0]?.signature !== 'EICAR-Test-File') throw new Error('EICAR signature not persisted');
}

async function assertTimeoutRetriesThenTimesOut() {
  const previous = process.env.FILE_SCAN_TIMEOUT_MS;
  process.env.FILE_SCAN_TIMEOUT_MS = '5';
  try {
    const prisma = new PrismaMock();
    const service = new FileScanService(prisma as any, new MinioMock('slow') as any, new HangingScanner());
    await service.enqueueScan('m3', '2026-05-16/slow.txt');
    await service.runPendingScans();
    if ((prisma.materialStatus as FileSafetyStatus | null) !== FileSafetyStatus.SCANNING) throw new Error('timeout retry did not keep material SCANNING');
    if (prisma.job.status !== FileScanJobStatus.PENDING || prisma.job.attempts !== 1) throw new Error('timeout job not queued for retry');
    await service.runPendingScans();
    await service.runPendingScans();
    if ((prisma.materialStatus as FileSafetyStatus | null) !== FileSafetyStatus.TIMEOUT) throw new Error('timeout material not marked TIMEOUT');
    if (prisma.job.status !== FileScanJobStatus.DEAD_LETTER || prisma.job.attempts !== 3) throw new Error('timeout job not terminal after max attempts');
  } finally {
    if (previous === undefined) delete process.env.FILE_SCAN_TIMEOUT_MS;
    else process.env.FILE_SCAN_TIMEOUT_MS = previous;
  }
}

async function run() {
  await assertSafeFilePasses();
  await assertEicarFileFails();
  await assertTimeoutRetriesThenTimesOut();
  console.log('min-file-scan-async-check passed');
}

run().catch((e) => { console.error(e); process.exit(1); });
