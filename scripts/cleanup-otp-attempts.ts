import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await prisma.otpAttempt.deleteMany({
      where: {
        createdAt: {
          lt: sevenDaysAgo,
        },
      },
    });

    console.log(`[cleanup:otp] deleted ${result.count} otp attempts older than ${sevenDaysAgo.toISOString()}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[cleanup:otp] failed:', error);
  process.exitCode = 1;
});
