import { Injectable } from "@nestjs/common";
import {
  FileSafetyStatus,
  MaterialStatus,
  MaterialVisibility,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../infra";
import {
  MaterialSearchQueryDto,
  MaterialSort,
} from "../dto/material-search-query.dto";
import {
  MaterialSearchEngine,
  MaterialSearchResult,
} from "./material-search-engine";
import { normalizeMaterialSearchQuery } from "./material-search-normalizer";

const TRGM_MIN_SIMILARITY = 0.001;

@Injectable()
export class PostgresMaterialSearchEngine implements MaterialSearchEngine {
  constructor(private readonly prisma: PrismaService) {}

  async searchApproved(
    rawQuery: MaterialSearchQueryDto,
  ): Promise<MaterialSearchResult> {
    const query = normalizeMaterialSearchQuery(rawQuery);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const skip = (page - 1) * pageSize;
    const sort = query.sort ?? MaterialSort.LATEST;

    if (query.q && query.q.trim() && sort !== MaterialSort.RATING) {
      return this.searchKeyword(query, page, pageSize, skip);
    }
    if (sort === MaterialSort.RATING) {
      return this.searchRating(query, page, pageSize, skip);
    }

    const where = this.buildApprovedWhere(query);
    const [items, total] = await Promise.all([
      this.prisma.material.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: this.buildOrderBy(sort, Boolean(query.q)),
        select: {
          id: true,
          title: true,
          description: true,
          stage: true,
          grade: true,
          subject: true,
          kind: true,
          year: true,
          region: true,
          visibility: true,
          createdAt: true,
          downloadCount: true,
          ratingSum: true,
          ratingCount: true,
        },
      }),
      this.prisma.material.count({ where }),
    ]);
    return {
      page,
      pageSize,
      total,
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        stage: item.stage,
        grade: item.grade,
        subject: item.subject,
        kind: item.kind,
        year: item.year,
        region: item.region,
        visibility: item.visibility,
        createdAt: item.createdAt,
        avg_score: averageFromCounters(item.ratingSum, item.ratingCount),
        download_count: item.downloadCount ?? 0,
      })),
    };
  }

  private async searchKeyword(
    query: MaterialSearchQueryDto,
    page: number,
    pageSize: number,
    skip: number,
  ): Promise<MaterialSearchResult> {
    const q = query.q!.trim();
    const rows = await this.runWithTrgmThreshold(
      this.prisma.$queryRaw<Array<RawKeywordRow>>(Prisma.sql`
      SELECT m.id, m.title, m.description, m.stage, m.grade, m.subject, m.kind, m.year, m.region, m.visibility,
        m.created_at AS "createdAt", m.download_count AS "downloadCount", m.rating_sum AS "ratingSum", m.rating_count AS "ratingCount",
        COUNT(*) OVER()::bigint AS "totalCount"
      FROM materials m
      WHERE m.status = 'APPROVED' AND m.visibility = 'PUBLIC' AND (m.file_safety_status = 'PASSED' OR m.file_safety_status IS NULL)
        AND (${query.subject ?? null}::text IS NULL OR LOWER(m.subject) = LOWER(${query.subject ?? null}))
        AND (${query.stage ?? null}::text IS NULL OR LOWER(m.stage) = LOWER(${query.stage ?? null}))
        AND (${query.grade ?? null}::text IS NULL OR LOWER(m.grade) = LOWER(${query.grade ?? null}))
        AND (${query.kind ?? null}::text IS NULL OR m.kind::text = ${query.kind ?? null})
        AND (${query.region ?? null}::text IS NULL OR LOWER(m.region) = LOWER(${query.region ?? null}))
        AND (${query.year ?? null}::int IS NULL OR m.year = ${query.year ?? null})
        AND (m.title % ${q} OR m.description % ${q})
      ORDER BY (similarity(m.title, ${q}) * 3.0 + similarity(COALESCE(m.description, ''), ${q}) * 1.0) DESC, m.created_at DESC
      LIMIT ${pageSize} OFFSET ${skip}
    `),
    );
    let total = rows[0] ? Number(rows[0].totalCount) : 0;
    if (rows.length === 0 && skip > 0)
      total = await this.countKeyword(query, q);
    return { page, pageSize, total, items: rows.map(mapRawRow) };
  }

  private async searchRating(
    query: MaterialSearchQueryDto,
    page: number,
    pageSize: number,
    skip: number,
  ): Promise<MaterialSearchResult> {
    const q = query.q && query.q.trim() ? query.q.trim() : null;
    const rows = await this.runWithTrgmThreshold(
      this.prisma.$queryRaw<Array<RawRatingRow>>(Prisma.sql`
      SELECT m.id, m.title, m.description, m.stage, m.grade, m.subject, m.kind, m.year, m.region, m.visibility,
        m.created_at AS "createdAt", (CASE WHEN m.rating_count > 0 THEN m.rating_sum::double precision / m.rating_count END) AS avg_score,
        m.rating_count AS rating_count, m.download_count AS download_count, COUNT(*) OVER()::bigint AS total_count
      FROM materials m
      WHERE m.status = 'APPROVED' AND m.visibility = 'PUBLIC' AND (m.file_safety_status = 'PASSED' OR m.file_safety_status IS NULL)
        AND (${query.subject ?? null}::text IS NULL OR LOWER(m.subject) = LOWER(${query.subject ?? null}))
        AND (${query.stage ?? null}::text IS NULL OR LOWER(m.stage) = LOWER(${query.stage ?? null}))
        AND (${query.grade ?? null}::text IS NULL OR LOWER(m.grade) = LOWER(${query.grade ?? null}))
        AND (${query.kind ?? null}::text IS NULL OR m.kind::text = ${query.kind ?? null})
        AND (${query.region ?? null}::text IS NULL OR LOWER(m.region) = LOWER(${query.region ?? null}))
        AND (${query.year ?? null}::int IS NULL OR m.year = ${query.year ?? null})
        AND (${q}::text IS NULL OR m.title % ${q} OR m.description % ${q})
      ORDER BY avg_score DESC NULLS LAST, rating_count DESC, m.created_at DESC LIMIT ${pageSize} OFFSET ${skip}
    `),
    );
    return {
      page,
      pageSize,
      total: rows[0] ? Number(rows[0].total_count) : 0,
      items: rows.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        stage: item.stage,
        grade: item.grade,
        subject: item.subject,
        kind: item.kind,
        year: item.year,
        region: item.region,
        visibility: item.visibility,
        createdAt: item.createdAt,
        avg_score: item.avg_score !== null ? Number(item.avg_score) : null,
        download_count: Number(item.download_count),
      })),
    };
  }

  private async countKeyword(
    query: MaterialSearchQueryDto,
    q: string,
  ): Promise<number> {
    const rows = await this.runWithTrgmThreshold(
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total FROM materials m
      WHERE m.status = 'APPROVED' AND m.visibility = 'PUBLIC' AND (m.file_safety_status = 'PASSED' OR m.file_safety_status IS NULL)
        AND (${query.subject ?? null}::text IS NULL OR LOWER(m.subject) = LOWER(${query.subject ?? null}))
        AND (${query.stage ?? null}::text IS NULL OR LOWER(m.stage) = LOWER(${query.stage ?? null}))
        AND (${query.grade ?? null}::text IS NULL OR LOWER(m.grade) = LOWER(${query.grade ?? null}))
        AND (${query.kind ?? null}::text IS NULL OR m.kind::text = ${query.kind ?? null})
        AND (${query.region ?? null}::text IS NULL OR LOWER(m.region) = LOWER(${query.region ?? null}))
        AND (${query.year ?? null}::int IS NULL OR m.year = ${query.year ?? null}) AND (m.title % ${q} OR m.description % ${q})
    `),
    );
    return rows[0] ? Number(rows[0].total) : 0;
  }

  private buildApprovedWhere(
    query: MaterialSearchQueryDto,
  ): Prisma.MaterialWhereInput {
    return {
      status: MaterialStatus.APPROVED,
      visibility: MaterialVisibility.PUBLIC,
      AND: [
        {
          OR: [
            { fileSafetyStatus: FileSafetyStatus.PASSED },
            { fileSafetyStatus: null },
          ],
        },
      ],
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: "insensitive" } },
              { description: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.stage
        ? { stage: { equals: query.stage, mode: "insensitive" } }
        : {}),
      ...(query.grade
        ? { grade: { equals: query.grade, mode: "insensitive" } }
        : {}),
      ...(query.subject
        ? { subject: { equals: query.subject, mode: "insensitive" } }
        : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(typeof query.year === "number" ? { year: query.year } : {}),
      ...(query.region
        ? { region: { equals: query.region, mode: "insensitive" } }
        : {}),
    };
  }

  private buildOrderBy(
    sort: MaterialSort,
    hasKeyword: boolean,
  ): Prisma.MaterialOrderByWithRelationInput[] {
    if (sort === MaterialSort.DOWNLOADS)
      return [{ downloadCount: "desc" }, { createdAt: "desc" }];
    if (sort === MaterialSort.RATING) return [{ createdAt: "desc" }];
    if (sort === MaterialSort.RELEVANCE)
      return hasKeyword
        ? [{ downloadCount: "desc" }, { createdAt: "desc" }]
        : [{ createdAt: "desc" }];
    return [{ createdAt: "desc" }];
  }

  private runWithTrgmThreshold<T>(query: Prisma.PrismaPromise<T>): Promise<T> {
    return this.prisma
      .$transaction([
        this.prisma.$executeRaw(
          Prisma.sql`SET LOCAL pg_trgm.similarity_threshold = ${Prisma.raw(String(TRGM_MIN_SIMILARITY))}`,
        ),
        query,
      ])
      .then((results) => results[1] as T);
  }
}

type RawKeywordRow = {
  id: string;
  title: string;
  description: string | null;
  stage: string | null;
  grade: string | null;
  subject: string | null;
  kind: string | null;
  year: number | null;
  region: string | null;
  visibility: MaterialVisibility;
  createdAt: Date;
  downloadCount: number;
  ratingSum: number;
  ratingCount: number;
  totalCount: bigint;
};
type RawRatingRow = Omit<
  RawKeywordRow,
  "downloadCount" | "ratingSum" | "ratingCount" | "totalCount"
> & {
  avg_score: number | null;
  rating_count: number;
  download_count: number;
  total_count: bigint;
};
function mapRawRow(item: RawKeywordRow) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    stage: item.stage,
    grade: item.grade,
    subject: item.subject,
    kind: item.kind,
    year: item.year,
    region: item.region,
    visibility: item.visibility,
    createdAt: item.createdAt,
    avg_score: averageFromCounters(item.ratingSum, item.ratingCount),
    download_count: Number(item.downloadCount ?? 0),
  };
}
function averageFromCounters(
  sum: number | null | undefined,
  count: number | null | undefined,
): number | null {
  const ratingCount = Number(count ?? 0);
  return ratingCount ? Number(sum ?? 0) / ratingCount : null;
}
