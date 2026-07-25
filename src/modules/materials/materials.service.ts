import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  FileSafetyStatus,
  Material,
  MaterialStatus,
  MaterialVisibility,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { runWithTrgmThreshold } from "../../common/pg-trgm";
import { MinioService, PrismaService } from "../../infra";
import { DownloadsService } from "../downloads/downloads.service";
import { CreateMaterialDto } from "./dto/create-material.dto";
import { CreateRatingDto } from "./dto/create-rating.dto";
import { MaterialRatingsQueryDto } from "./dto/material-ratings-query.dto";
import {
  MaterialSearchQueryDto,
  MaterialSort,
} from "./dto/material-search-query.dto";
import { UploadFileInput } from "./file-upload.type";
import { FileScanService } from "./file-scan.service";
import { sanitizeFilename, stripControlChars } from "./upload-security.util";

export type UploadedMaterial = Pick<
  Material,
  | "id"
  | "title"
  | "description"
  | "stage"
  | "grade"
  | "subject"
  | "year"
  | "region"
  | "fileKey"
  | "visibility"
  | "status"
  | "uploaderId"
  | "createdAt"
  | "fileSafetyStatus"
>;

/**
 * Shared predicate for every public keyword-search branch below.
 *
 * All four raw-SQL branches (keyword page, keyword count, rating page, rating
 * count) must filter identically — a divergence between them is what previously
 * let rows appear in one branch's results and 404 on click, or made pagination
 * totals disagree with the page contents. Building the clause once removes the
 * chance of them drifting apart again.
 *
 * `keyword` is optional so the rating branch can reuse it with `q` absent.
 */
function approvedPublicWhere(
  query: MaterialSearchQueryDto,
  keyword: string | null,
): Prisma.Sql {
  return Prisma.sql`
    m.status = 'APPROVED'
    AND m.visibility = 'PUBLIC'
    AND (m.file_safety_status = 'PASSED' OR m.file_safety_status IS NULL)
    AND (${query.subject ?? null}::text IS NULL OR LOWER(m.subject) = LOWER(${query.subject ?? null}))
    AND (${query.stage ?? null}::text IS NULL OR LOWER(m.stage) = LOWER(${query.stage ?? null}))
    AND (${query.grade ?? null}::text IS NULL OR LOWER(m.grade) = LOWER(${query.grade ?? null}))
    AND (${query.region ?? null}::text IS NULL OR LOWER(m.region) = LOWER(${query.region ?? null}))
    AND (${query.year ?? null}::int IS NULL OR m.year = ${query.year ?? null})
    AND (${keyword}::text IS NULL OR m.title % ${keyword} OR m.description % ${keyword})
  `;
}

@Injectable()
export class MaterialsService {
  private readonly logger = new Logger(MaterialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
    private readonly fileScanService: FileScanService,
    private readonly downloadsService: DownloadsService,
  ) {}

  async createWithFile(params: {
    uploaderId: string;
    dto: CreateMaterialDto;
    file: UploadFileInput;
  }): Promise<UploadedMaterial> {
    const safeName = sanitizeFilename(params.file.originalname);
    const key = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName}`;

    await this.minioService.uploadObject(
      key,
      params.file.buffer,
      params.file.mimetype,
    );

    let material;
    try {
      material = await this.prisma.material.create({
        data: {
          title: stripControlChars(params.dto.title),
          description: params.dto.description
            ? stripControlChars(params.dto.description)
            : undefined,
          stage: params.dto.stage,
          grade: params.dto.grade,
          subject: params.dto.subject,
          year: params.dto.year,
          region: params.dto.region,
          visibility: params.dto.visibility ?? MaterialVisibility.PUBLIC,
          status: MaterialStatus.PENDING,
          fileKey: key,
          uploaderId: params.uploaderId,
          fileSafetyStatus: FileSafetyStatus.QUARANTINED,
        },
        select: {
          id: true,
          title: true,
          description: true,
          stage: true,
          grade: true,
          subject: true,
          year: true,
          region: true,
          fileKey: true,
          visibility: true,
          status: true,
          uploaderId: true,
          createdAt: true,
          fileSafetyStatus: true,
        },
      });
    } catch (err) {
      await this.minioService.deleteObject(key).catch(() => {
        this.logger.error({ event: "orphan_cleanup_failed", fileKey: key });
      });
      throw err;
    }

    await this.fileScanService.enqueueScan(material.id, key);

    return material;
  }

  async searchApproved(query: MaterialSearchQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const skip = (page - 1) * pageSize;
    const sort = query.sort ?? MaterialSort.LATEST;

    const where = this.buildApprovedWhere(query);
    const orderBy = this.buildOrderBy(sort, Boolean(query.q));

    if (query.q && query.q.trim() && sort !== MaterialSort.RATING) {
      const q = query.q.trim();
      // `title % q` / `description % q` drive a BitmapOr over the two GIN trigram
      // indexes; ordering still ranks by exact similarity() on the matched rows only.
      // `description % q` is NULL (falsy) for NULL descriptions, matching the old
      // similarity(COALESCE(description,''), q) > 0 which was always false there.
      const rows = await this.runWithTrgmThreshold(
        this.prisma.$queryRaw<
          Array<{
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
          }>
        >(Prisma.sql`
        SELECT
          m.id, m.title, m.description, m.stage, m.grade, m.subject, m.kind, m.year, m.region,
          m.visibility, m.created_at AS "createdAt",
          m.download_count AS "downloadCount",
          m.rating_sum AS "ratingSum",
          m.rating_count AS "ratingCount",
          COUNT(*) OVER()::bigint AS "totalCount"
        FROM materials m
        WHERE ${approvedPublicWhere(query, q)}
        ORDER BY (similarity(m.title, ${q}) + similarity(COALESCE(m.description, ''), ${q})) DESC, m.created_at DESC
        LIMIT ${pageSize} OFFSET ${skip}
      `),
      );
      // COUNT(*) OVER() only yields a value on non-empty pages. For an out-of-range
      // OFFSET (skip > 0 with no rows) fall back to a dedicated count so pagination metadata
      // stays correct instead of collapsing to total: 0 while earlier pages have matches.
      let total = rows[0] ? Number(rows[0].totalCount) : 0;
      if (rows.length === 0 && skip > 0) {
        const countRows = await this.runWithTrgmThreshold(
          this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
          SELECT COUNT(*)::bigint AS total
          FROM materials m
          WHERE ${approvedPublicWhere(query, q)}
        `),
        );
        total = countRows[0] ? Number(countRows[0].total) : 0;
      }
      return {
        page,
        pageSize,
        total,
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
          avg_score: averageFromCounters(item.ratingSum, item.ratingCount),
          download_count: Number(item.downloadCount ?? 0),
        })),
      };
    }

    if (sort === MaterialSort.RATING) {
      // B1 fix: raw SQL + LIMIT/OFFSET to avoid full-table load into memory.
      // Perf: avg/count/downloads now come from the denormalized material counters
      // (rating_sum/rating_count/download_count) instead of per-row correlated
      // subqueries, which ran 2 indexed scans on ratings + 1 on downloads for every
      // candidate row (≈30k scans per page on a 15k-material corpus).
      // C1: subject/stage/grade/region compared case-insensitively (LOWER = LOWER), matching
      //     buildApprovedWhere's `mode: 'insensitive'` so rating sort returns the same set as other sorts.
      // C2: when `q` is supplied, keep the keyword (trigram) filter — the keyword branch above only
      //     runs for non-RATING sorts, so without this `?q=...&sort=rating` would ignore the keyword.
      const q = query.q && query.q.trim() ? query.q.trim() : null;
      const ratingRows = await this.runWithTrgmThreshold(
        this.prisma.$queryRaw<
          Array<{
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
            avg_score: number | null;
            rating_count: number;
            download_count: number;
            total_count: bigint;
          }>
        >(Prisma.sql`
        SELECT
          m.id, m.title, m.description, m.stage, m.grade, m.subject, m.kind, m.year, m.region,
          m.visibility, m.created_at AS "createdAt",
          (CASE WHEN m.rating_count > 0 THEN m.rating_sum::double precision / m.rating_count END) AS avg_score,
          m.rating_count AS rating_count,
          m.download_count AS download_count,
          COUNT(*) OVER()::bigint AS total_count
        FROM materials m
        WHERE ${approvedPublicWhere(query, q)}
        ORDER BY avg_score DESC NULLS LAST, rating_count DESC, m.created_at DESC
        LIMIT ${pageSize} OFFSET ${skip}
      `),
      );

      // C3: COUNT(*) OVER() only yields a value on non-empty pages. For an out-of-range
      // OFFSET (skip > 0 with no rows) fall back to a dedicated count so pagination metadata
      // stays correct instead of collapsing to total: 0 while earlier pages have matches.
      let total = ratingRows[0] ? Number(ratingRows[0].total_count) : 0;
      if (ratingRows.length === 0 && skip > 0) {
        const countRows = await this.runWithTrgmThreshold(
          this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
          SELECT COUNT(*)::bigint AS total
          FROM materials m
          WHERE ${approvedPublicWhere(query, q)}
        `),
        );
        total = countRows[0] ? Number(countRows[0].total) : 0;
      }

      return {
        page,
        pageSize,
        total,
        items: ratingRows.map((item) => ({
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

    // Perf: download/rating figures come from the denormalized counters on the row
    // itself. The previous `_count: { downloads }` select made Prisma LEFT JOIN
    // `(SELECT material_id, COUNT(*) FROM downloads GROUP BY material_id)` — a full
    // aggregation of the downloads table on every page — and a second query
    // (rating.groupBy) fetched the page's averages.
    const [items, total] = await Promise.all([
      this.prisma.material.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
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

  async getApprovedDetail(id: string) {
    // Perf: counters live on the material row, so the detail page is a single query
    // (previously: material + downloads aggregation join + a rating.aggregate query).
    const material = await this.ensurePublicApprovedMaterial(id, {
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
        uploaderId: true,
        uploader: {
          select: {
            id: true,
            username: true,
          },
        },
        downloadCount: true,
        ratingSum: true,
        ratingCount: true,
      },
    });

    const { downloadCount, ratingSum, ratingCount, ...base } = material;
    return {
      ...base,
      // Mocked Prisma in min-* scripts may omit the relation; coerce to null for a stable shape.
      uploader: material.uploader ?? null,
      avg_score: averageFromCounters(ratingSum, ratingCount),
      rating_count: ratingCount ?? 0,
      download_count: downloadCount ?? 0,
    };
  }

  async upsertMaterialRating(params: {
    materialId: string;
    userId: string;
    dto: CreateRatingDto;
  }) {
    await this.ensurePublicApprovedMaterial(params.materialId);

    const upsertArgs = {
      where: {
        userId_materialId: {
          userId: params.userId,
          materialId: params.materialId,
        },
      },
      create: {
        userId: params.userId,
        materialId: params.materialId,
        score: params.dto.score,
        comment: params.dto.content,
      },
      update: {
        score: params.dto.score,
        comment: params.dto.content,
      },
      select: {
        id: true,
        userId: true,
        materialId: true,
        score: true,
        comment: true,
        createdAt: true,
        updatedAt: true,
      },
    } satisfies Prisma.RatingUpsertArgs;

    let rating;
    try {
      rating = await this.prisma.rating.upsert(upsertArgs);
    } catch (err) {
      // Two concurrent first ratings can both take the `create` path; the loser hits the
      // unique constraint (P2002). Retry once — the row exists now, so upsert updates.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        rating = await this.prisma.rating.upsert(upsertArgs);
      } else {
        throw err;
      }
    }

    const aggregate = await this.prisma.rating.aggregate({
      where: { materialId: params.materialId },
      _avg: { score: true },
      _sum: { score: true },
      _count: { score: true },
    });

    // Refresh the denormalized counters from the authoritative aggregate. Recompute
    // (not delta) keeps this convergent: a racing stale write is corrected by the
    // next rating, and scripts/backfill-material-counters.ts can rebuild at any time.
    await this.prisma.material.update({
      where: { id: params.materialId },
      data: {
        ratingSum: aggregate._sum.score ?? 0,
        ratingCount: aggregate._count.score,
      },
      select: { id: true },
    });

    return {
      id: rating.id,
      user_id: rating.userId,
      material_id: rating.materialId,
      score: rating.score,
      content: rating.comment,
      created_at: rating.createdAt,
      updated_at: rating.updatedAt,
      avg_score: aggregate._avg.score ?? null,
      rating_count: aggregate._count.score,
    };
  }

  async listApprovedMaterialRatings(
    materialId: string,
    query: MaterialRatingsQueryDto,
  ) {
    await this.ensurePublicApprovedMaterial(materialId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const skip = (page - 1) * pageSize;

    const [items, total, aggregate] = await Promise.all([
      this.prisma.rating.findMany({
        where: { materialId },
        skip,
        take: pageSize,
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          userId: true,
          materialId: true,
          score: true,
          comment: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      }),
      this.prisma.rating.count({ where: { materialId } }),
      this.prisma.rating.aggregate({
        where: { materialId },
        _avg: { score: true },
        _count: { score: true },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      avg_score: aggregate._avg.score ?? null,
      rating_count: aggregate._count.score,
      items: items.map((item) => ({
        id: item.id,
        user_id: item.userId,
        material_id: item.materialId,
        score: item.score,
        content: item.comment,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
        // Reviewer identity for the ratings UI; null-coalesced for mocked Prisma in min-* scripts.
        user: item.user ?? null,
      })),
    };
  }

  async downloadApprovedMaterial(
    materialId: string,
    userId: string,
    request?: { protocol?: string; get?: (name: string) => string | undefined },
  ) {
    return this.downloadsService.createTokenForApprovedMaterial(
      materialId,
      userId,
      request,
    );
  }

  private async ensurePublicApprovedMaterial<
    TSelect extends Prisma.MaterialSelect,
  >(
    materialId: string,
    options?: { select?: TSelect },
  ): Promise<Prisma.MaterialGetPayload<{ select: TSelect }>> {
    const select = (options?.select ?? ({ id: true } as TSelect)) as TSelect;

    const material = await this.prisma.material.findFirst({
      where: {
        id: materialId,
        status: MaterialStatus.APPROVED,
        visibility: MaterialVisibility.PUBLIC,
        // PASSED or null (pre-scan legacy rows) — must mirror buildApprovedWhere and the
        // raw-SQL list branches, otherwise a material visible in lists 404s on detail/ratings.
        OR: [
          { fileSafetyStatus: FileSafetyStatus.PASSED },
          { fileSafetyStatus: null },
        ],
      },
      select,
    });

    if (!material) {
      throw new NotFoundException("Material not found");
    }

    return material as Prisma.MaterialGetPayload<{ select: TSelect }>;
  }

  private buildApprovedWhere(
    query: MaterialSearchQueryDto,
  ): Prisma.MaterialWhereInput {
    return {
      status: MaterialStatus.APPROVED,
      visibility: MaterialVisibility.PUBLIC,
      // Only surface materials whose file passed the async scan (or predates it,
      // i.e. null), matching the keyword raw-SQL branch and the detail/download
      // guard. Without this, APPROVED-but-QUARANTINED/SCANNING/FAILED/TIMEOUT
      // rows leak into list/RATING results and then 404 on click/download.
      AND: [
        {
          OR: [
            { fileSafetyStatus: FileSafetyStatus.PASSED },
            { fileSafetyStatus: null },
          ],
        },
      ],
      // No keyword clause here on purpose: every branch that has a `q` goes
      // through the raw trigram SQL above, so this builder only ever runs for
      // keyword-less queries. A `contains` OR-clause here would additionally have
      // collided with the `AND` key below and silently replaced it.
      ...(query.stage
        ? { stage: { equals: query.stage, mode: "insensitive" } }
        : {}),
      ...(query.grade
        ? { grade: { equals: query.grade, mode: "insensitive" } }
        : {}),
      ...(query.subject
        ? { subject: { equals: query.subject, mode: "insensitive" } }
        : {}),
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
    // Perf: sort on the denormalized downloadCount column. The relation-count form
    // ({ downloads: { _count: 'desc' } }) made Prisma LEFT JOIN a GROUP BY over the
    // whole downloads table twice (once for ordering, once for the count selection).
    if (sort === MaterialSort.DOWNLOADS) {
      return [{ downloadCount: "desc" }, { createdAt: "desc" }];
    }

    if (sort === MaterialSort.RATING) {
      return [{ createdAt: "desc" }];
    }

    if (sort === MaterialSort.RELEVANCE) {
      return hasKeyword
        ? [{ downloadCount: "desc" }, { createdAt: "desc" }]
        : [{ createdAt: "desc" }];
    }

    return [{ createdAt: "desc" }];
  }

  /** See src/common/pg-trgm.ts — shared with SearchService so both pin the same GUC. */
  private runWithTrgmThreshold<T>(query: Prisma.PrismaPromise<T>): Promise<T> {
    return runWithTrgmThreshold(this.prisma, query);
  }
}

/** avg = sum/count from the denormalized counters; null when unrated (or counters absent in mocks). */
function averageFromCounters(
  sum: number | null | undefined,
  count: number | null | undefined,
): number | null {
  const ratingCount = Number(count ?? 0);
  if (!ratingCount) {
    return null;
  }
  return Number(sum ?? 0) / ratingCount;
}
