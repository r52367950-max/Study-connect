/**
 * Rebuilds the denormalized material counters (download_count, rating_sum,
 * rating_count) from the downloads/ratings tables.
 *
 * Run once after applying the migration that adds the columns, and again any
 * time rows are changed outside the API write paths (manual SQL, cascades from
 * hard-deleting users/materials, restores).
 *
 *   DATABASE_URL=... npx ts-node scripts/backfill-material-counters.ts
 */
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const updated = await prisma.$executeRaw`
      UPDATE materials m
      SET download_count = COALESCE(d.cnt, 0),
          rating_sum     = COALESCE(r.sum, 0),
          rating_count   = COALESCE(r.cnt, 0)
      FROM materials m2
      LEFT JOIN (SELECT material_id, COUNT(*)::int AS cnt FROM downloads GROUP BY material_id) d
        ON d.material_id = m2.id
      LEFT JOIN (SELECT material_id, SUM(score)::int AS sum, COUNT(*)::int AS cnt FROM ratings GROUP BY material_id) r
        ON r.material_id = m2.id
      WHERE m.id = m2.id
        AND (m.download_count IS DISTINCT FROM COALESCE(d.cnt, 0)
          OR m.rating_sum     IS DISTINCT FROM COALESCE(r.sum, 0)
          OR m.rating_count   IS DISTINCT FROM COALESCE(r.cnt, 0))
    `;
    console.info(`backfill-material-counters: updated ${updated} material row(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
