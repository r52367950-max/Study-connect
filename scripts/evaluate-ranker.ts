/**
 * Offline recommendation proxy evaluation.
 *
 * Compares ranker versions with aggregate interaction proxies from ViewEvent,
 * Favorite and Download. This is not a replacement for online A/B metrics: it
 * measures whether each ranker's top-N set overlaps with materials that already
 * receive views/favorites/downloads in the selected lookback window.
 *
 * Usage:
 *   DATABASE_URL=... ts-node scripts/evaluate-ranker.ts --rankers ranker_v1,ranker_v2 --top 30 --days 30
 */
import { FileSafetyStatus, MaterialKind, MaterialStatus, MaterialVisibility, PrismaClient } from '@prisma/client';
import { Ranker } from '../src/modules/materials/recommendations.service';
import { RANKER_CONFIGS, RankerVersion } from '../src/modules/materials/recommendation-rankers.config';

const prisma = new PrismaClient();

type Args = { rankers: RankerVersion[]; top: number; days: number };

function parseArgs(): Args {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) {
    args.set(process.argv[i], process.argv[i + 1]);
  }
  const rankers = (args.get('--rankers') ?? 'ranker_v1,ranker_v2')
    .split(',')
    .map((r) => r.trim())
    .filter((r): r is RankerVersion => r in RANKER_CONFIGS);
  return {
    rankers: rankers.length ? rankers : ['ranker_v1'],
    top: Number(args.get('--top') ?? 30),
    days: Number(args.get('--days') ?? 30),
  };
}

async function main() {
  const args = parseArgs();
  const since = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000);
  const [materials, viewRows, favoriteRows, downloadRows] = await Promise.all([
    prisma.material.findMany({
      where: {
        status: MaterialStatus.APPROVED,
        visibility: MaterialVisibility.PUBLIC,
        OR: [{ fileSafetyStatus: FileSafetyStatus.PASSED }, { fileSafetyStatus: null }],
      },
      take: 1000,
      orderBy: [{ downloadCount: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.viewEvent.groupBy({ by: ['materialId'], where: { createdAt: { gte: since } }, _count: true }),
    prisma.favorite.groupBy({ by: ['materialId'], where: { createdAt: { gte: since } }, _count: true }),
    prisma.download.groupBy({ by: ['materialId'], where: { downloadedAt: { gte: since } }, _count: true }),
  ]);

  const views = new Map(viewRows.map((row) => [row.materialId, row._count]));
  const favorites = new Map(favoriteRows.map((row) => [row.materialId, row._count]));
  const downloads = new Map(downloadRows.map((row) => [row.materialId, row._count]));
  const ranker = new Ranker();
  const user = {
    id: 'offline-eval',
    onboardedAt: new Date(),
    subjects: [],
    grades: [],
    stages: [],
    city: null,
    viewedKinds: [],
    schoolId: null,
    collaborativeOptIn: false,
  };

  console.table(args.rankers.map((version) => {
    const top = ranker.rank({
      materials: materials.map((material) => ({ ...material, candidateSources: ['popular' as const] })),
      user,
      config: RANKER_CONFIGS[version],
      phase: 'phase-1',
      viewedKindEnums: new Set<MaterialKind>(),
      colleagueSignals: new Set<string>(),
      includeDebugSignals: false,
    }).slice(0, args.top);
    const viewCount = top.reduce((sum, item) => sum + (views.get(item.id) ?? 0), 0);
    const favoriteCount = top.reduce((sum, item) => sum + (favorites.get(item.id) ?? 0), 0);
    const downloadCount = top.reduce((sum, item) => sum + (downloads.get(item.id) ?? 0), 0);
    return {
      ranker: version,
      topN: args.top,
      lookbackDays: args.days,
      viewEvents: viewCount,
      favorites: favoriteCount,
      downloads: downloadCount,
      ctrProxy: viewCount / Math.max(args.top, 1),
      favoriteRateProxy: favoriteCount / Math.max(viewCount, 1),
      downloadRateProxy: downloadCount / Math.max(viewCount, 1),
    };
  }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
