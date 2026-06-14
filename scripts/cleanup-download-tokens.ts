import { PrismaClient } from '@prisma/client';

/**
 * Removes spent and expired one-time download tokens so the `download_tokens`
 * table cannot grow without bound (one row is minted per download request, and
 * rows are otherwise only removed by ON DELETE CASCADE of their material/user).
 * Run from cron, e.g. hourly: `npm run cleanup:download-tokens`.
 */
async function main() {
  const prisma = new PrismaClient();
  try {
    const now = new Date();
    const result = await (prisma as any).downloadToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }],
      },
    });
    console.log(`[cleanup:download-tokens] deleted ${result.count} expired/used download tokens`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[cleanup:download-tokens] failed:', error);
  process.exitCode = 1;
});
