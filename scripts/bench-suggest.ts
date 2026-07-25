/** Times the real SearchService against the seeded DB, versus both older query forms. */
import { PrismaClient, Prisma } from '@prisma/client';
import { SearchService } from '../src/modules/search/search.service';

const prisma = new PrismaClient();
const QUERIES = ['高一数学', '物理期中', '化学讲义', '英语模拟', '语文专题'];
const ROUNDS = 6;

function stats(ms: number[]) {
  const sorted = [...ms].sort((a, b) => a - b);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return {
    p50: +p(0.5).toFixed(1),
    p95: +p(0.95).toFixed(1),
    mean: +(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(1),
  };
}

async function timeIt(label: string, fn: (q: string) => Promise<unknown>) {
  for (const q of QUERIES) await fn(q); // warm
  const ms: number[] = [];
  let lastCount = 0;
  for (let r = 0; r < ROUNDS; r += 1) {
    for (const q of QUERIES) {
      const t = process.hrtime.bigint();
      const rows = (await fn(q)) as unknown[];
      ms.push(Number(process.hrtime.bigint() - t) / 1e6);
      lastCount = rows.length;
    }
  }
  const s = stats(ms);
  console.log(
    `${label.padEnd(46)} p50=${String(s.p50).padStart(7)}ms  p95=${String(s.p95).padStart(7)}ms  mean=${String(s.mean).padStart(7)}ms  rows=${lastCount}`,
  );
  return s;
}

/** The form shipped before any of this work. */
function originalQuery(q: string) {
  return prisma.$queryRaw<unknown[]>(Prisma.sql`
    SELECT m.id AS "materialId", m.title FROM materials m
    WHERE m.status = 'APPROVED' AND m.visibility = 'PUBLIC'
      AND (similarity(m.title, ${q}) > 0 OR similarity(COALESCE(m.description, ''), ${q}) > 0)
    ORDER BY (similarity(m.title, ${q}) + similarity(COALESCE(m.description, ''), ${q})) DESC, m.created_at DESC
    LIMIT 10`);
}

/** The intermediate `%` rewrite (index-able, but not selective at threshold 0.001). */
function percentQuery(q: string) {
  return prisma
    .$transaction([
      prisma.$executeRaw(Prisma.sql`SET LOCAL pg_trgm.similarity_threshold = ${Prisma.raw('0.001')}`),
      prisma.$queryRaw<unknown[]>(Prisma.sql`
        SELECT m.id AS "materialId", m.title FROM materials m
        WHERE m.status = 'APPROVED' AND m.visibility = 'PUBLIC'
          AND (m.file_safety_status = 'PASSED' OR m.file_safety_status IS NULL)
          AND (m.title % ${q} OR m.description % ${q})
        ORDER BY (similarity(m.title, ${q}) + similarity(COALESCE(m.description, ''), ${q})) DESC, m.created_at DESC
        LIMIT 10`),
    ])
    .then((rows: unknown[]) => rows[1] as unknown[]);
}

async function run() {
  const service = new SearchService(prisma as never);
  console.log(`corpus: ${await prisma.material.count()} materials, ${QUERIES.length} queries x ${ROUNDS} rounds\n`);

  const before = await timeIt('[A] original: similarity(col,q) > 0  (seq scan)', originalQuery);
  const mid = await timeIt('[B] `%` rewrite @ threshold 0.001    (seq scan)', percentQuery);
  const now = await timeIt('[C] shipped: GiST KNN `<->` + dist<1 (index)', (q) => service.suggest(q, 10));

  console.log(`\nA -> C speedup: ${(before.p50 / now.p50).toFixed(1)}x   B -> C speedup: ${(mid.p50 / now.p50).toFixed(1)}x`);

  // Correctness contract. The *ranking objective* changed (sum-of-similarities
  // across both columns -> smallest per-column distance), so the exact membership
  // of a top-10 legitimately shifts, especially on a corpus with many ties. What
  // must hold is the recall boundary and the absence of false positives.
  console.log('\n--- correctness ---');

  let precisionFailures = 0;
  let emptinessMismatches = 0;
  let overlapTotal = 0;

  for (const q of QUERIES) {
    const original = (await originalQuery(q)) as Array<{ materialId: string }>;
    const knn = await service.suggest(q, 10);

    // (1) No false positives: every returned row must genuinely share a trigram.
    const ids = knn.map((r) => r.materialId);
    if (ids.length > 0) {
      const bad = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
        SELECT COUNT(*) AS n FROM materials m
        WHERE m.id = ANY(${ids}::uuid[])
          AND similarity(m.title, ${q}) = 0
          AND similarity(COALESCE(m.description, ''), ${q}) = 0`);
      if (Number(bad[0].n) > 0) precisionFailures += 1;
    }

    // (2) Same recall boundary: both find results, or neither does.
    if (original.length === 0 !== (knn.length === 0)) emptinessMismatches += 1;

    const overlap = ids.filter((id) => original.some((r) => r.materialId === id)).length;
    overlapTotal += overlap;
    console.log(`  "${q}": original=${original.length} knn=${knn.length} top-10 overlap=${overlap}`);
  }

  // (3) The distance floor must reject a query sharing no trigram at all.
  const nonsense = await service.suggest('zzzqqqxxxvvv', 10);
  const nonsenseOriginal = (await originalQuery('zzzqqqxxxvvv')) as unknown[];

  console.log(`\nfalse positives (returned rows with similarity 0): ${precisionFailures}/${QUERIES.length} queries`);
  console.log(`recall-boundary mismatches vs original:            ${emptinessMismatches}/${QUERIES.length} queries`);
  console.log(`mean top-10 overlap with original ranking:         ${(overlapTotal / QUERIES.length).toFixed(1)}/10`);
  console.log(`no-shared-trigram query returns empty:             knn=${nonsense.length} original=${nonsenseOriginal.length}`);

  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
