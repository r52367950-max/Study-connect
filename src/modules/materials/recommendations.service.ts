import { Injectable, Optional } from '@nestjs/common';
import { FileSafetyStatus, MaterialKind, MaterialStatus, MaterialVisibility, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra';
import { MetricsService } from '../metrics/metrics.service';

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
};

const DEFAULT_LIMIT = 6;
const DEFAULT_RANKER = 'ranker_v1';
const SCHOOL_DENSITY_MIN = 10;
const VIEW_EVENT_PHASE2_MIN = 20;
const DENSITY_CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class RecommendationsService {

  private readonly schoolDensityCache = new Map<string, { count: number; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  /**
   * Score formula (stage 1 / ranker_v1):
   *   subject(5) + grade(3) + stage(2) + city(1.5) + viewedKind(1)
   *   + log10(dl+1) * 0.8 + (avg-4) * 2 + (year>=2024 ? 0.6 : 0)
   *
   * Privacy: when `collaborativeOptIn` is true and a school is set,
   * materials favored by >= 3 other school colleagues get +1.5
   * (K-anonymity threshold prevents single-user reverse-inference).
   */
  async recommend(
    user: RecommendUserProfile,
    options: { limit?: number; ranker?: string } = {},
  ): Promise<RecommendationItem[]> {
    const startedAt = process.hrtime.bigint();
    const limit = options.limit ?? DEFAULT_LIMIT;
    const ranker = options.ranker ?? DEFAULT_RANKER;
    const basePhase = this.pickBasePhase(user);
    // Perf: the candidate pool is independent of phase selection, so it loads in
    // parallel with the view-event probe instead of after it. Download/rating
    // figures come from the denormalized material counters (downloadCount/
    // ratingSum/ratingCount) — previously this fetch carried a LEFT JOIN that
    // aggregated the whole downloads table plus a 200-id rating.groupBy.
    // B8: count distinct materialIds rather than total rows so the phase-2 threshold
    // reflects "how many different materials has the user seen" rather than total events.
    // C4: only the phase-2 threshold check matters, so the distinct lookup is capped
    // at VIEW_EVENT_PHASE2_MIN rows instead of loading the user's entire view history.
    const [viewEventCount, materials] = await Promise.all([
      basePhase === 'phase-0'
        ? Promise.resolve(0)
        : this.prisma.viewEvent
            .findMany({
              where: { userId: user.id },
              select: { materialId: true },
              distinct: ['materialId'],
              take: VIEW_EVENT_PHASE2_MIN,
            })
            .then((rows) => rows.length),
      this.prisma.material.findMany({
        where: {
          status: MaterialStatus.APPROVED,
          visibility: MaterialVisibility.PUBLIC,
          // Same PASSED-or-null gate as the public list/detail paths; without it,
          // QUARANTINED/SCANNING/FAILED files surface here and 404 on click/download.
          OR: [{ fileSafetyStatus: FileSafetyStatus.PASSED }, { fileSafetyStatus: null }],
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);

    const phase = await this.pickStrategy(user, { viewEventCount, basePhase });

    const [dynamicViewedKinds, colleagueSignals] = await Promise.all([
      phase === 'phase-2' || phase === 'phase-3' ? this.getDynamicViewedKinds(user.id) : [],
      phase === 'phase-3' ? this.getColleagueSignals(user) : new Set<string>(),
    ]);

    const subjectKindMap: Record<string, MaterialKind | null> = { 习题: MaterialKind.EXERCISE, 讲义: MaterialKind.HANDOUT, 真题: MaterialKind.EXAM, 模拟: MaterialKind.MOCK };
    const viewedSource = phase === 'phase-2' || phase === 'phase-3' ? (dynamicViewedKinds.length ? dynamicViewedKinds : user.viewedKinds) : user.viewedKinds;
    const viewedKindEnums = new Set(viewedSource.map((k) => subjectKindMap[k] ?? null).filter((k): k is MaterialKind => !!k));

    const scored: RecommendationItem[] = materials.map((m) => {
      const ratingCount = m.ratingCount ?? 0;
      const agg = {
        avg: ratingCount > 0 ? (m.ratingSum ?? 0) / ratingCount : null,
        count: ratingCount,
      };
      const downloads = m.downloadCount ?? 0;
      const contentEnabled = phase !== 'phase-0';
      const subjectMatch = contentEnabled && m.subject && user.subjects.includes(m.subject) ? 5 : 0;
      const gradeMatch = contentEnabled && m.grade && user.grades.includes(m.grade) ? 3 : 0;
      const stageMatch = contentEnabled && m.stage && user.stages.includes(m.stage) ? 2 : 0;
      const cityMatch = contentEnabled && m.region && user.city && m.region === user.city ? 1.5 : 0;
      const kindMatch = contentEnabled && m.kind && viewedKindEnums.has(m.kind) ? 1 : 0;
      const popularityScore = Math.log10(downloads + 1) * 0.8;
      // Floor the rating contribution so a single sub-3 review can't push a
      // material below an entirely-unrated one (`(1-4)*2 = -6` would dominate
      // popularity/freshness signals in phase-0).
      const ratingScore = Math.max(-2, ((agg.avg ?? 4) - 4) * 2);
      const freshnessScore = (m.year ?? 0) >= 2024 ? 0.6 : 0;
      const collaborativeScore = phase === 'phase-3' && user.collaborativeOptIn && colleagueSignals.has(m.id) ? 1.5 : 0;
      const score = phase === 'phase-0'
        ? popularityScore + ratingScore + freshnessScore
        : subjectMatch + gradeMatch + stageMatch + cityMatch + kindMatch + popularityScore + ratingScore + freshnessScore + collaborativeScore;
      return { id: m.id, title: m.title, description: m.description, subject: m.subject, stage: m.stage, grade: m.grade, kind: m.kind, year: m.year, region: m.region, downloadCount: downloads, avgScore: agg.avg, ratingCount: agg.count, score, reason: phase === 'phase-0' ? '热门资料' : this.reasonFor({ subjectMatch, gradeMatch, stageMatch, collaborativeScore, downloads, avgScore: agg.avg, year: m.year }), rankerId: ranker, phase };
    });

    scored.sort((a, b) => b.score - a.score);
    this.metrics?.increment('recommendations_total', { phase, ranker });
    this.metrics?.observe('recommendations_duration_seconds', Number(process.hrtime.bigint() - startedAt) / 1_000_000_000, { phase, ranker });
    return scored.slice(0, limit);
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
    return !user.onboardedAt || (user.stages.length === 0 && user.subjects.length === 0)
      ? 'phase-0'
      : 'phase-1';
  }

  private async getDynamicViewedKinds(userId: string): Promise<string[]> {
    const nowMinus30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const grouped = await this.prisma.viewEvent.groupBy({ by: ['kind'], where: { userId, createdAt: { gt: nowMinus30d } }, _count: true });
    const labelByKind: Record<string, string | undefined> = { EXERCISE: '习题', HANDOUT: '讲义', EXAM: '真题', MOCK: '模拟' };
    return grouped
      .filter((g) => !!g.kind)
      .sort((a, b) => b._count - a._count)
      .slice(0, 2)
      .map((g) => labelByKind[g.kind!])
      // Unknown kinds (future enum additions) map to undefined; filter them
      // out so the return type's `string[]` doesn't carry `undefined`s.
      .filter((k): k is string => !!k);
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
    // K-anonymity: require at least 3 distinct colleagues so we can never
    // reverse-infer a single colleague's preferences from this signal.
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
        GROUP BY m."id"
        HAVING COUNT(DISTINCT u."id") >= 3
      `,
    );
    return new Set(rows.map((row) => row.materialId));
  }

  private reasonFor(input: {
    subjectMatch: number;
    gradeMatch: number;
    stageMatch: number;
    collaborativeScore: number;
    downloads: number;
    avgScore: number | null;
    year: number | null;
  }): string {
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
