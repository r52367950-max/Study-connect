import { Injectable } from '@nestjs/common';
import { FileSafetyStatus, Material, MaterialKind, MaterialStatus, MaterialVisibility, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra';
import { DEFAULT_RANKER, RankerConfig, resolveRankerConfig } from './recommendation-rankers.config';

export type RecommendUserProfile = {
  id: string;
  onboardedAt?: Date | null;
  subjects: string[];
  grades: string[];
  stages: string[];
  city: string | null;
  viewedKinds: string[];
  schoolId: string | null;
  collaborativeOptIn: boolean;
};

export type RankerPhase = 'phase-0' | 'phase-1' | 'phase-2' | 'phase-3';

export type RecommendationDebugSignals = {
  candidateSources: string[];
  subjectMatch: number;
  gradeMatch: number;
  stageMatch: number;
  cityMatch: number;
  kindMatch: number;
  popularityScore: number;
  ratingScore: number;
  freshnessScore: number;
  collaborativeScore: number;
};

export type RecommendationItem = {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  stage: string | null;
  grade: string | null;
  kind: MaterialKind | null;
  year: number | null;
  region: string | null;
  downloadCount: number;
  avgScore: number | null;
  ratingCount: number;
  score: number;
  reason: string;
  rankerId: string;
  phase: RankerPhase | null;
  debugSignals?: RecommendationDebugSignals;
};

type CandidateSource = 'profile' | 'popular' | 'school' | 'recent';

// Only the columns the Ranker actually reads. Projecting these keeps candidate rows narrow
// (drops fileKey, reviewComment, status, visibility, fileSafetyStatus, uploaderId, updatedAt)
// so up to ~300 candidates/recommend request aren't fully hydrated and deserialized.
const CANDIDATE_SELECT = {
  id: true,
  title: true,
  description: true,
  subject: true,
  stage: true,
  grade: true,
  kind: true,
  year: true,
  region: true,
  downloadCount: true,
  ratingSum: true,
  ratingCount: true,
} satisfies Prisma.MaterialSelect;

type CandidateFields = Prisma.MaterialGetPayload<{ select: typeof CANDIDATE_SELECT }>;
type CandidateMaterial = CandidateFields & { candidateSources: CandidateSource[] };

const DEFAULT_LIMIT = 6;
const SCHOOL_DENSITY_MIN = 10;
const VIEW_EVENT_PHASE2_MIN = 20;
const DENSITY_CACHE_TTL_MS = 5 * 60 * 1000;
const PUBLIC_APPROVED_WHERE = {
  status: MaterialStatus.APPROVED,
  visibility: MaterialVisibility.PUBLIC,
  OR: [{ fileSafetyStatus: FileSafetyStatus.PASSED }, { fileSafetyStatus: null }],
} satisfies Prisma.MaterialWhereInput;

export class CandidateProvider {
  constructor(private readonly prisma: PrismaService) {}

  async getCandidates(input: {
    user: RecommendUserProfile;
    config: RankerConfig;
    phase: RankerPhase;
    viewedKindEnums: Set<MaterialKind>;
  }): Promise<CandidateMaterial[]> {
    const { user, config, phase, viewedKindEnums } = input;
    const [profile, popular, schoolIds, recent] = await Promise.all([
      this.profileCandidates(user, config, phase, viewedKindEnums),
      this.popularCandidates(config),
      this.schoolCandidateIds(user, config, phase),
      this.recentCandidates(config),
    ]);
    const school = schoolIds.length ? await this.materialsByIds(schoolIds) : [];
    return this.mergeCandidates([
      { source: 'profile', materials: profile },
      { source: 'popular', materials: popular },
      { source: 'school', materials: school },
      { source: 'recent', materials: recent },
    ]);
  }

  private profileCandidates(user: RecommendUserProfile, config: RankerConfig, phase: RankerPhase, viewedKindEnums: Set<MaterialKind>) {
    if (phase === 'phase-0') return Promise.resolve([]);
    const or: Prisma.MaterialWhereInput[] = [];
    if (user.subjects.length) or.push({ subject: { in: user.subjects } });
    if (user.grades.length) or.push({ grade: { in: user.grades } });
    if (user.stages.length) or.push({ stage: { in: user.stages } });
    if (user.city) or.push({ region: user.city });
    if (viewedKindEnums.size) or.push({ kind: { in: [...viewedKindEnums] } });
    if (!or.length) return Promise.resolve([]);
    return this.prisma.material.findMany({
      where: { ...PUBLIC_APPROVED_WHERE, AND: [{ OR: or }] },
      orderBy: [{ downloadCount: 'desc' }, { createdAt: 'desc' }],
      take: config.candidateLimits.profile,
      select: CANDIDATE_SELECT,
    });
  }

  private popularCandidates(config: RankerConfig) {
    return this.prisma.material.findMany({
      where: PUBLIC_APPROVED_WHERE,
      orderBy: [{ downloadCount: 'desc' }, { ratingCount: 'desc' }, { createdAt: 'desc' }],
      take: config.candidateLimits.popular,
      select: CANDIDATE_SELECT,
    });
  }

  private recentCandidates(config: RankerConfig) {
    return this.prisma.material.findMany({
      where: PUBLIC_APPROVED_WHERE,
      orderBy: { createdAt: 'desc' },
      take: config.candidateLimits.recent,
      select: CANDIDATE_SELECT,
    });
  }

  private async schoolCandidateIds(user: RecommendUserProfile, config: RankerConfig, phase: RankerPhase): Promise<string[]> {
    if (phase !== 'phase-3' || !user.collaborativeOptIn || !user.schoolId) return [];
    const rows = await this.prisma.$queryRaw<{ materialId: string; favCount: bigint }[]>(
      Prisma.sql`
        SELECT m."id" AS "materialId", COUNT(DISTINCT u."id") AS "favCount"
        FROM "users" u
        JOIN "favorites" f ON f."user_id" = u."id"
        JOIN "materials" m ON m."id" = f."material_id"
        WHERE u."school_id" = ${user.schoolId}::uuid
          AND u."id" <> ${user.id}::uuid
          AND u."collaborative_opt_in" = true
          AND m."status" = 'APPROVED'
          AND m."visibility" = 'PUBLIC'
          AND (m."file_safety_status" = 'PASSED' OR m."file_safety_status" IS NULL)
        GROUP BY m."id"
        HAVING COUNT(DISTINCT u."id") >= 3
        ORDER BY "favCount" DESC
        LIMIT ${config.candidateLimits.school}
      `,
    );
    return rows.map((row) => row.materialId);
  }

  private materialsByIds(ids: string[]) {
    return this.prisma.material.findMany({
      where: { ...PUBLIC_APPROVED_WHERE, id: { in: ids } },
      select: CANDIDATE_SELECT,
    });
  }

  private mergeCandidates(groups: { source: CandidateSource; materials: CandidateFields[] }[]): CandidateMaterial[] {
    const merged = new Map<string, CandidateMaterial>();
    for (const group of groups) {
      for (const material of group.materials) {
        const existing = merged.get(material.id);
        if (existing) {
          if (!existing.candidateSources.includes(group.source)) existing.candidateSources.push(group.source);
        } else {
          merged.set(material.id, { ...material, candidateSources: [group.source] });
        }
      }
    }
    return [...merged.values()];
  }
}

export class Ranker {
  rank(input: {
    materials: CandidateMaterial[];
    user: RecommendUserProfile;
    config: RankerConfig;
    phase: RankerPhase;
    viewedKindEnums: Set<MaterialKind>;
    colleagueSignals: Set<string>;
    includeDebugSignals: boolean;
  }): RecommendationItem[] {
    const { materials, user, config, phase, viewedKindEnums, colleagueSignals, includeDebugSignals } = input;
    const w = config.weights;
    return materials.map((m) => {
      const ratingCount = m.ratingCount ?? 0;
      const avg = ratingCount > 0 ? (m.ratingSum ?? 0) / ratingCount : null;
      const downloads = m.downloadCount ?? 0;
      const contentEnabled = phase !== 'phase-0';
      const subjectMatch = contentEnabled && m.subject && user.subjects.includes(m.subject) ? w.subject : 0;
      const gradeMatch = contentEnabled && m.grade && user.grades.includes(m.grade) ? w.grade : 0;
      const stageMatch = contentEnabled && m.stage && user.stages.includes(m.stage) ? w.stage : 0;
      const cityMatch = contentEnabled && m.region && user.city && m.region === user.city ? w.city : 0;
      const kindMatch = contentEnabled && m.kind && viewedKindEnums.has(m.kind) ? w.viewedKind : 0;
      const popularityScore = Math.log10(downloads + 1) * w.popularity;
      const ratingScore = Math.max(w.ratingFloor, ((avg ?? 4) - 4) * w.rating);
      const freshnessScore = (m.year ?? 0) >= 2024 ? w.freshness : 0;
      const collaborativeScore = phase === 'phase-3' && user.collaborativeOptIn && colleagueSignals.has(m.id) ? w.collaborative : 0;
      const score = phase === 'phase-0'
        ? popularityScore + ratingScore + freshnessScore
        : subjectMatch + gradeMatch + stageMatch + cityMatch + kindMatch + popularityScore + ratingScore + freshnessScore + collaborativeScore;
      const debugSignals = includeDebugSignals
        ? { candidateSources: m.candidateSources, subjectMatch, gradeMatch, stageMatch, cityMatch, kindMatch, popularityScore, ratingScore, freshnessScore, collaborativeScore }
        : undefined;
      return { id: m.id, title: m.title, description: m.description, subject: m.subject, stage: m.stage, grade: m.grade, kind: m.kind, year: m.year, region: m.region, downloadCount: downloads, avgScore: avg, ratingCount, score, reason: phase === 'phase-0' ? '热门资料' : this.reasonFor({ subjectMatch, gradeMatch, stageMatch, collaborativeScore, downloads, avgScore: avg, year: m.year }), rankerId: config.id, phase, ...(debugSignals ? { debugSignals } : {}) };
    }).sort((a, b) => b.score - a.score);
  }

  private reasonFor(input: { subjectMatch: number; gradeMatch: number; stageMatch: number; collaborativeScore: number; downloads: number; avgScore: number | null; year: number | null }): string {
    if (input.collaborativeScore > 0) return '同校老师常用';
    if (input.subjectMatch > 0 && input.gradeMatch > 0) return '与你的学科·年级匹配';
    if (input.subjectMatch > 0 && input.stageMatch > 0) return '你常用的学段·学科';
    if (input.subjectMatch > 0) return '你常用的学科';
    if (input.stageMatch > 0) return '你常用的学段';
    if (input.downloads >= 1500) return '高人气';
    if ((input.avgScore ?? 0) >= 4.8) return '好评推荐';
    if ((input.year ?? 0) >= 2024) return '近期热点';
    return '基于浏览记录';
  }
}

@Injectable()
export class RecommendationsService {
  private readonly schoolDensityCache = new Map<string, { count: number; expiresAt: number }>();
  private readonly candidateProvider: CandidateProvider;
  private readonly ranker = new Ranker();

  constructor(private readonly prisma: PrismaService) {
    this.candidateProvider = new CandidateProvider(prisma);
  }

  async recommend(user: RecommendUserProfile, options: { limit?: number; ranker?: string; includeDebugSignals?: boolean } = {}): Promise<RecommendationItem[]> {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const config = resolveRankerConfig(options.ranker ?? DEFAULT_RANKER);
    const basePhase = this.pickBasePhase(user);
    const viewEventCount = basePhase === 'phase-0'
      ? 0
      : await this.prisma.viewEvent.findMany({ where: { userId: user.id }, select: { materialId: true }, distinct: ['materialId'], take: VIEW_EVENT_PHASE2_MIN }).then((rows) => rows.length);
    const phase = await this.pickStrategy(user, { viewEventCount, basePhase });
    const dynamicViewedKinds = phase === 'phase-2' || phase === 'phase-3' ? await this.getDynamicViewedKinds(user.id) : [];
    const viewedKindEnums = this.toViewedKindEnums(dynamicViewedKinds.length ? dynamicViewedKinds : user.viewedKinds);
    const [materials, colleagueSignals] = await Promise.all([
      this.candidateProvider.getCandidates({ user, config, phase, viewedKindEnums }),
      phase === 'phase-3' ? this.getColleagueSignals(user) : new Set<string>(),
    ]);
    return this.ranker.rank({ materials, user, config, phase, viewedKindEnums, colleagueSignals, includeDebugSignals: !!options.includeDebugSignals }).slice(0, limit);
  }

  async pickStrategy(user: RecommendUserProfile, signals: { viewEventCount: number; basePhase?: RankerPhase }): Promise<RankerPhase> {
    const basePhase = signals.basePhase ?? this.pickBasePhase(user);
    if (basePhase === 'phase-0') return 'phase-0';
    if (signals.viewEventCount < VIEW_EVENT_PHASE2_MIN) return 'phase-1';
    if (!user.collaborativeOptIn || !user.schoolId) return 'phase-2';
    const schoolUserCount = await this.getSchoolOnboardedCount(user.schoolId);
    return schoolUserCount >= SCHOOL_DENSITY_MIN ? 'phase-3' : 'phase-2';
  }

  private pickBasePhase(user: RecommendUserProfile): RankerPhase {
    return !user.onboardedAt || (user.stages.length === 0 && user.subjects.length === 0) ? 'phase-0' : 'phase-1';
  }

  private toViewedKindEnums(labels: string[]): Set<MaterialKind> {
    const subjectKindMap: Record<string, MaterialKind | null> = { 习题: MaterialKind.EXERCISE, 讲义: MaterialKind.HANDOUT, 真题: MaterialKind.EXAM, 模拟: MaterialKind.MOCK };
    return new Set(labels.map((k) => subjectKindMap[k] ?? null).filter((k): k is MaterialKind => !!k));
  }

  private async getDynamicViewedKinds(userId: string): Promise<string[]> {
    const nowMinus30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const grouped = await this.prisma.viewEvent.groupBy({ by: ['kind'], where: { userId, createdAt: { gt: nowMinus30d } }, _count: true });
    const labelByKind: Record<string, string | undefined> = { EXERCISE: '习题', HANDOUT: '讲义', EXAM: '真题', MOCK: '模拟' };
    return grouped.filter((g) => !!g.kind).sort((a, b) => b._count - a._count).slice(0, 2).map((g) => labelByKind[g.kind!]).filter((k): k is string => !!k);
  }

  private async getSchoolOnboardedCount(schoolId: string): Promise<number> {
    const now = Date.now();
    const cached = this.schoolDensityCache.get(schoolId);
    if (cached && cached.expiresAt > now) return cached.count;
    const count = await this.prisma.user.count({ where: { schoolId, onboardedAt: { not: null } } });
    this.schoolDensityCache.set(schoolId, { count, expiresAt: now + DENSITY_CACHE_TTL_MS });
    return count;
  }

  private async getColleagueSignals(user: RecommendUserProfile): Promise<Set<string>> {
    if (!user.collaborativeOptIn || !user.schoolId) return new Set();
    const schoolUserCount = await this.getSchoolOnboardedCount(user.schoolId);
    if (schoolUserCount < SCHOOL_DENSITY_MIN) return new Set();
    const rows = await this.prisma.$queryRaw<{ materialId: string }[]>(
      Prisma.sql`
        SELECT m."id" AS "materialId"
        FROM "users" u
        JOIN "favorites" f ON f."user_id" = u."id"
        JOIN "materials" m ON m."id" = f."material_id"
        WHERE u."school_id" = ${user.schoolId}::uuid
          AND u."id" <> ${user.id}::uuid
          AND u."collaborative_opt_in" = true
          AND m."status" = 'APPROVED'
          AND m."visibility" = 'PUBLIC'
          AND (m."file_safety_status" = 'PASSED' OR m."file_safety_status" IS NULL)
        GROUP BY m."id"
        HAVING COUNT(DISTINCT u."id") >= 3
      `,
    );
    return new Set(rows.map((row) => row.materialId));
  }
}
