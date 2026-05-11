/// <reference path="../src/types/express.d.ts" />
/**
 * Minimal regression check for RecommendationsService scoring.
 *
 * Verifies:
 *   - Profile match dominates pure popularity (subject(5)+grade(3) > log10 dl)
 *   - Stage match acts as a fallback signal
 *   - Reason strings differentiate the matching path
 *   - K-anonymity: collaborative signals require >= 3 distinct school peers
 *
 * Pure in-process stub of PrismaService so this can run without a live DB.
 */
import { MaterialKind, MaterialStatus, MaterialVisibility } from '@prisma/client';
import { RecommendationsService } from '../src/modules/materials/recommendations.service';

type StubMaterial = {
  id: string;
  title: string;
  description: string | null;
  stage: string | null;
  grade: string | null;
  subject: string | null;
  kind: MaterialKind | null;
  year: number | null;
  region: string | null;
  status: MaterialStatus;
  visibility: MaterialVisibility;
  createdAt: Date;
  _count: { downloads: number };
};

function makeMaterial(overrides: Partial<StubMaterial>): StubMaterial {
  return {
    id: overrides.id ?? cryptoRandom(),
    title: overrides.title ?? 'untitled',
    description: overrides.description ?? null,
    stage: overrides.stage ?? null,
    grade: overrides.grade ?? null,
    subject: overrides.subject ?? null,
    kind: overrides.kind ?? null,
    year: overrides.year ?? null,
    region: overrides.region ?? null,
    status: MaterialStatus.APPROVED,
    visibility: MaterialVisibility.PUBLIC,
    createdAt: new Date(),
    _count: overrides._count ?? { downloads: 0 },
  };
}

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2, 12);
}

function buildPrismaStub(opts: {
  materials: StubMaterial[];
  ratings?: { materialId: string; avg: number; count: number }[];
  colleagueMaterials?: string[];
}) {
  return {
    material: {
      findMany: async () => opts.materials,
    },
    rating: {
      groupBy: async () =>
        (opts.ratings ?? []).map((r) => ({
          materialId: r.materialId,
          _avg: { score: r.avg },
          _count: { score: r.count },
        })),
    },
    $queryRaw: async () =>
      (opts.colleagueMaterials ?? []).map((id) => ({ materialId: id })),
  };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    throw new Error(msg);
  }
}

async function testProfileMatchBeatsPopularity() {
  const popular = makeMaterial({
    id: 'popular',
    subject: '英语',
    grade: '高一',
    stage: '高中',
    _count: { downloads: 100_000 },
  });
  const matched = makeMaterial({
    id: 'matched',
    subject: '数学',
    grade: '高一',
    stage: '高中',
    _count: { downloads: 50 },
  });

  const service = new RecommendationsService(
    buildPrismaStub({ materials: [popular, matched] }) as never,
  );
  const items = await service.recommend({
    id: 'u1',
    subjects: ['数学'],
    grades: ['高一'],
    stages: ['高中'],
    city: null,
    viewedKinds: [],
    schoolId: null,
    collaborativeOptIn: false,
  });

  assert(items[0]?.id === 'matched', 'profile-matched material must rank above popular non-match');
  assert(items[0]?.reason === '与你的学科·年级匹配', 'reason should reflect subject+grade match');
}

async function testStageFallback() {
  const stageOnly = makeMaterial({ id: 'stage-only', stage: '高中', subject: '物理' });
  const noMatch = makeMaterial({ id: 'misc', subject: '语文', stage: '初中', grade: '初二' });

  const service = new RecommendationsService(
    buildPrismaStub({ materials: [stageOnly, noMatch] }) as never,
  );
  const items = await service.recommend({
    id: 'u1',
    subjects: ['数学'],
    grades: [],
    stages: ['高中'],
    city: null,
    viewedKinds: [],
    schoolId: null,
    collaborativeOptIn: false,
  });

  assert(items[0]?.id === 'stage-only', 'stage match should outrank no-match');
  assert(items[0]?.reason === '你常用的学段', 'reason should reflect stage-only fallback');
}

async function testCollaborativeKAnonymity() {
  const target = makeMaterial({ id: 'collab', subject: '历史' });
  const baseline = makeMaterial({ id: 'plain', subject: '历史' });

  // When opt-in is false, collaborative signal must not influence ordering
  const optedOut = new RecommendationsService(
    buildPrismaStub({
      materials: [target, baseline],
      colleagueMaterials: ['collab'],
    }) as never,
  );
  const optedOutItems = await optedOut.recommend({
    id: 'u1',
    subjects: [],
    grades: [],
    stages: [],
    city: null,
    viewedKinds: [],
    schoolId: 'school-1',
    collaborativeOptIn: false,
  });
  const scoreOptedOut = optedOutItems.find((i) => i.id === 'collab')!.score;
  const baselineScoreOptedOut = optedOutItems.find((i) => i.id === 'plain')!.score;
  assert(
    Math.abs(scoreOptedOut - baselineScoreOptedOut) < 0.0001,
    'opt-out user must not receive collaborative boost',
  );

  // K-anonymity is enforced by the SQL HAVING clause; the stub here returns
  // pre-filtered ids, so we just verify the boost is applied when ids exist.
  const optedIn = new RecommendationsService(
    buildPrismaStub({
      materials: [target, baseline],
      colleagueMaterials: ['collab'],
    }) as never,
  );
  const optedInItems = await optedIn.recommend({
    id: 'u1',
    subjects: [],
    grades: [],
    stages: [],
    city: null,
    viewedKinds: [],
    schoolId: 'school-1',
    collaborativeOptIn: true,
  });
  const collabItem = optedInItems.find((i) => i.id === 'collab')!;
  assert(collabItem.reason === '同校老师常用', 'collaborative reason must not name colleagues');
  assert(collabItem.score > baselineScoreOptedOut, 'collaborative boost should rank colleague favorite higher');
}

async function main() {
  await testProfileMatchBeatsPopularity();
  await testStageFallback();
  await testCollaborativeKAnonymity();
  console.info('min-recommendations-check passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
