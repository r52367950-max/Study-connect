import { Injectable } from '@nestjs/common';
import { MaterialKind, MaterialStatus, MaterialVisibility, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra';

export type RecommendUserProfile = {
  id: string;
  subjects: string[];
  grades: string[];
  stages: string[];
  city: string | null;
  viewedKinds: string[];
  schoolId: string | null;
  collaborativeOptIn: boolean;
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
};

const DEFAULT_LIMIT = 6;
const DEFAULT_RANKER = 'ranker_v1';

@Injectable()
export class RecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const limit = options.limit ?? DEFAULT_LIMIT;
    const ranker = options.ranker ?? DEFAULT_RANKER;

    const materials = await this.prisma.material.findMany({
      where: {
        status: MaterialStatus.APPROVED,
        visibility: MaterialVisibility.PUBLIC,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        _count: { select: { downloads: true } },
      },
    });

    const ids = materials.map((m) => m.id);
    const aggregates = ids.length
      ? await this.prisma.rating.groupBy({
          by: ['materialId'],
          where: { materialId: { in: ids } },
          _avg: { score: true },
          _count: { score: true },
        })
      : [];
    const aggregateMap = new Map(
      aggregates.map((row) => [row.materialId, { avg: row._avg.score, count: row._count.score }]),
    );

    const colleagueSignals = await this.getColleagueSignals(user);

    const subjectKindMap: Record<string, MaterialKind | null> = {
      习题: MaterialKind.EXERCISE,
      讲义: MaterialKind.HANDOUT,
      真题: MaterialKind.EXAM,
      模拟: MaterialKind.MOCK,
    };
    const viewedKindEnums = new Set(
      user.viewedKinds.map((k) => subjectKindMap[k] ?? null).filter((k): k is MaterialKind => !!k),
    );

    const scored: RecommendationItem[] = materials.map((m) => {
      const agg = aggregateMap.get(m.id) ?? { avg: null, count: 0 };
      const downloads = m._count.downloads;
      const subjectMatch = m.subject && user.subjects.includes(m.subject) ? 5 : 0;
      const gradeMatch = m.grade && user.grades.includes(m.grade) ? 3 : 0;
      const stageMatch = m.stage && user.stages.includes(m.stage) ? 2 : 0;
      const cityMatch = m.region && user.city && m.region === user.city ? 1.5 : 0;
      const kindMatch = m.kind && viewedKindEnums.has(m.kind) ? 1 : 0;
      const popularityScore = Math.log10(downloads + 1) * 0.8;
      const ratingScore = ((agg.avg ?? 4) - 4) * 2;
      const freshnessScore = (m.year ?? 0) >= 2024 ? 0.6 : 0;
      const collaborativeScore =
        user.collaborativeOptIn && colleagueSignals.has(m.id) ? 1.5 : 0;
      const score =
        subjectMatch +
        gradeMatch +
        stageMatch +
        cityMatch +
        kindMatch +
        popularityScore +
        ratingScore +
        freshnessScore +
        collaborativeScore;

      return {
        id: m.id,
        title: m.title,
        description: m.description,
        subject: m.subject,
        stage: m.stage,
        grade: m.grade,
        kind: m.kind,
        year: m.year,
        region: m.region,
        downloadCount: downloads,
        avgScore: agg.avg,
        ratingCount: agg.count,
        score,
        reason: this.reasonFor({
          subjectMatch,
          gradeMatch,
          stageMatch,
          collaborativeScore,
          downloads,
          avgScore: agg.avg,
          year: m.year,
        }),
        rankerId: ranker,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  private async getColleagueSignals(user: RecommendUserProfile): Promise<Set<string>> {
    if (!user.collaborativeOptIn || !user.schoolId) return new Set();
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
