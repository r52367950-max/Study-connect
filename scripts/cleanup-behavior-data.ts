import { PrismaClient } from '@prisma/client';

const VIEW_EVENT_RETENTION_DAYS = Number(process.env.VIEW_EVENT_RETENTION_DAYS ?? 180);
const DOWNLOAD_RETENTION_DAYS = Number(process.env.DOWNLOAD_RETENTION_DAYS ?? 365);
const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const prisma = new PrismaClient();
  try {
    const now = Date.now();
    const viewEventCutoff = new Date(now - VIEW_EVENT_RETENTION_DAYS * DAY_MS);
    const downloadCutoff = new Date(now - DOWNLOAD_RETENTION_DAYS * DAY_MS);

    const [viewEvents, downloads] = await prisma.$transaction([
      prisma.viewEvent.deleteMany({ where: { createdAt: { lt: viewEventCutoff } } }),
      prisma.download.deleteMany({ where: { downloadedAt: { lt: downloadCutoff } } }),
    ]);

    console.log(`[cleanup:behavior-data] deleted ${viewEvents.count} view events older than ${viewEventCutoff.toISOString()}`);
    console.log(`[cleanup:behavior-data] deleted ${downloads.count} downloads older than ${downloadCutoff.toISOString()}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[cleanup:behavior-data] failed:', error);
  process.exitCode = 1;
});
