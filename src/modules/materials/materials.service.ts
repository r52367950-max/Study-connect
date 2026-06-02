import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FileSafetyStatus, Material, MaterialStatus, MaterialVisibility, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { MinioService, PrismaService } from '../../infra';
import { CreateMaterialDto } from './dto/create-material.dto';
import { CreateRatingDto } from './dto/create-rating.dto';
import { MaterialRatingsQueryDto } from './dto/material-ratings-query.dto';
import { MaterialSearchQueryDto, MaterialSort } from './dto/material-search-query.dto';
import { UploadFileInput } from './file-upload.type';
import { FileScanService } from './file-scan.service';
import { sanitizeFilename, stripControlChars } from './upload-security.util';

export type UploadedMaterial = Pick<
  Material,
  | 'id'
  | 'title'
  | 'description'
  | 'stage'
  | 'grade'
  | 'subject'
  | 'year'
  | 'region'
  | 'fileKey'
  | 'visibility'
  | 'status'
  | 'uploaderId'
  | 'createdAt'
  | 'fileSafetyStatus'
>;

@Injectable()
export class MaterialsService {
  private readonly logger = new Logger(MaterialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
    private readonly fileScanService: FileScanService,
  ) {}

  async createWithFile(params: {
    uploaderId: string;
    dto: CreateMaterialDto;
    file: UploadFileInput;
  }): Promise<UploadedMaterial> {
    const safeName = sanitizeFilename(params.file.originalname);
    const key = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName}`;

    await this.minioService.uploadObject(key, params.file.buffer, params.file.mimetype);

    let material;
    try {
      material = await this.prisma.material.create({
      data: {
        title: stripControlChars(params.dto.title),
        description: params.dto.description ? stripControlChars(params.dto.description) : undefined,
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
        this.logger.error({ event: 'orphan_cleanup_failed', fileKey: key });
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
      const rows = await this.prisma.$queryRaw<Array<{
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
        downloadCount: bigint;
        totalCount: bigint;
      }>>(Prisma.sql`
        SELECT
          m.id, m.title, m.description, m.stage, m.grade, m.subject, m.kind, m.year, m.region,
          m.visibility, m.created_at AS "createdAt",
          COUNT(d.id)::bigint AS "downloadCount",
          COUNT(*) OVER()::bigint AS "totalCount"
        FROM materials m
        LEFT JOIN downloads d ON d.material_id = m.id
        WHERE m.status = 'APPROVED'
          AND m.visibility = 'PUBLIC'
          AND (m.file_safety_status = 'PASSED' OR m.file_safety_status IS NULL)
          AND (${query.subject ?? null}::text IS NULL OR LOWER(m.subject) = LOWER(${query.subject ?? null}))
          AND (${query.stage ?? null}::text IS NULL OR LOWER(m.stage) = LOWER(${query.stage ?? null}))
          AND (${query.grade ?? null}::text IS NULL OR LOWER(m.grade) = LOWER(${query.grade ?? null}))
          AND (${query.region ?? null}::text IS NULL OR LOWER(m.region) = LOWER(${query.region ?? null}))
          AND (${query.year ?? null}::int IS NULL OR m.year = ${query.year ?? null})
          AND (similarity(m.title, ${q}) > 0 OR similarity(COALESCE(m.description, ''), ${q}) > 0)
        GROUP BY m.id
        ORDER BY (similarity(m.title, ${q}) + similarity(COALESCE(m.description, ''), ${q})) DESC, m.created_at DESC
        LIMIT ${pageSize} OFFSET ${skip}
      `);
      const total = rows[0] ? Number(rows[0].totalCount) : 0;
      const materialIds = rows.map((item) => item.id);
      const averages = materialIds.length
        ? await this.prisma.rating.groupBy({ by: ['materialId'], where: { materialId: { in: materialIds } }, _avg: { score: true } })
        : [];
      const averageMap = new Map(averages.map((row) => [row.materialId, row._avg.score]));
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
          avg_score: averageMap.get(item.id) ?? null,
          download_count: Number(item.downloadCount),
        })),
      };
    }

    if (sort === MaterialSort.RATING) {
      // B1 fix: use raw SQL with LEFT JOIN aggregation + LIMIT/OFFSET to avoid full-table load into memory.
      // C1: subject/stage/grade/region compared case-insensitively (LOWER = LOWER), matching
      //     buildApprovedWhere's `mode: 'insensitive'` so rating sort returns the same set as other sorts.
      // C2: when `q` is supplied, keep the keyword (trigram) filter — the keyword branch above only
      //     runs for non-RATING sorts, so without this `?q=...&sort=rating` would ignore the keyword.
      const q = query.q && query.q.trim() ? query.q.trim() : null;
      const ratingRows = await this.prisma.$queryRaw<Array<{
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
        rating_count: bigint;
        download_count: bigint;
        total_count: bigint;
      }>>(Prisma.sql`
        SELECT
          m.id, m.title, m.description, m.stage, m.grade, m.subject, m.kind, m.year, m.region,
          m.visibility, m.created_at AS "createdAt",
          AVG(r.score) AS avg_score,
          COUNT(DISTINCT r.id)::bigint AS rating_count,
          COUNT(DISTINCT d.id)::bigint AS download_count,
          COUNT(*) OVER()::bigint AS total_count
        FROM materials m
        LEFT JOIN ratings r ON r.material_id = m.id
        LEFT JOIN downloads d ON d.material_id = m.id
        WHERE m.status = 'APPROVED'
          AND m.visibility = 'PUBLIC'
          AND (m.file_safety_status = 'PASSED' OR m.file_safety_status IS NULL)
          AND (${query.subject ?? null}::text IS NULL OR LOWER(m.subject) = LOWER(${query.subject ?? null}))
          AND (${query.stage ?? null}::text IS NULL OR LOWER(m.stage) = LOWER(${query.stage ?? null}))
          AND (${query.grade ?? null}::text IS NULL OR LOWER(m.grade) = LOWER(${query.grade ?? null}))
          AND (${query.region ?? null}::text IS NULL OR LOWER(m.region) = LOWER(${query.region ?? null}))
          AND (${query.year ?? null}::int IS NULL OR m.year = ${query.year ?? null})
          AND (${q}::text IS NULL OR similarity(m.title, ${q}) > 0 OR similarity(COALESCE(m.description, ''), ${q}) > 0)
        GROUP BY m.id
        ORDER BY avg_score DESC NULLS LAST, rating_count DESC, m.created_at DESC
        LIMIT ${pageSize} OFFSET ${skip}
      `);

      // C3: COUNT(*) OVER() only yields a value on non-empty pages. For an out-of-range
      // OFFSET (skip > 0 with no rows) fall back to a dedicated count so pagination metadata
      // stays correct instead of collapsing to total: 0 while earlier pages have matches.
      let total = ratingRows[0] ? Number(ratingRows[0].total_count) : 0;
      if (ratingRows.length === 0 && skip > 0) {
        const countRows = await this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
          SELECT COUNT(*)::bigint AS total
          FROM materials m
          WHERE m.status = 'APPROVED'
            AND m.visibility = 'PUBLIC'
            AND (m.file_safety_status = 'PASSED' OR m.file_safety_status IS NULL)
            AND (${query.subject ?? null}::text IS NULL OR LOWER(m.subject) = LOWER(${query.subject ?? null}))
            AND (${query.stage ?? null}::text IS NULL OR LOWER(m.stage) = LOWER(${query.stage ?? null}))
            AND (${query.grade ?? null}::text IS NULL OR LOWER(m.grade) = LOWER(${query.grade ?? null}))
            AND (${query.region ?? null}::text IS NULL OR LOWER(m.region) = LOWER(${query.region ?? null}))
            AND (${query.year ?? null}::int IS NULL OR m.year = ${query.year ?? null})
            AND (${q}::text IS NULL OR similarity(m.title, ${q}) > 0 OR similarity(COALESCE(m.description, ''), ${q}) > 0)
        `);
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
          _count: {
            select: {
              downloads: true,
            },
          },
        },
      }),
      this.prisma.material.count({ where }),
    ]);

    const materialIds = items.map((item) => item.id);
    const averages = materialIds.length
      ? await this.prisma.rating.groupBy({
          by: ['materialId'],
          where: { materialId: { in: materialIds } },
          _avg: { score: true },
        })
      : [];

    const averageMap = new Map(averages.map((row) => [row.materialId, row._avg.score]));

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
        avg_score: averageMap.get(item.id) ?? null,
        download_count: item._count.downloads,
      })),
    };
  }

  async getApprovedDetail(id: string) {
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
        _count: {
          select: {
            downloads: true,
          },
        },
      },
    });

    const aggregate = await this.prisma.rating.aggregate({
      where: { materialId: material.id },
      _avg: { score: true },
      _count: { score: true },
    });

    const { _count, ...base } = material;
    return {
      ...base,
      avg_score: aggregate._avg.score ?? null,
      rating_count: aggregate._count.score,
      download_count: _count.downloads,
    };
  }

  async upsertMaterialRating(params: { materialId: string; userId: string; dto: CreateRatingDto }) {
    await this.ensurePublicApprovedMaterial(params.materialId);

    const rating = await this.prisma.rating.upsert({
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
    });

    const aggregate = await this.prisma.rating.aggregate({
      where: { materialId: params.materialId },
      _avg: { score: true },
      _count: { score: true },
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

  async listApprovedMaterialRatings(materialId: string, query: MaterialRatingsQueryDto) {
    await this.ensurePublicApprovedMaterial(materialId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const skip = (page - 1) * pageSize;

    const [items, total, aggregate] = await Promise.all([
      this.prisma.rating.findMany({
        where: { materialId },
        skip,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          userId: true,
          materialId: true,
          score: true,
          comment: true,
          createdAt: true,
          updatedAt: true,
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
      })),
    };
  }

  async downloadApprovedMaterial(materialId: string, userId: string) {
    const material = await this.ensureDownloadablePublicMaterial(materialId);

    const download = await this.prisma.download.create({
      data: {
        userId,
        materialId: material.id,
      },
      select: {
        id: true,
        userId: true,
        materialId: true,
        downloadedAt: true,
      },
    });

    return {
      materialId: material.id,
      downloadUrl: this.minioService.getSignedDownloadUrl(material.fileKey),
      downloadRecord: download,
    };
  }


  private async ensureApprovedMaterial<TSelect extends Prisma.MaterialSelect>(
    materialId: string,
    options?: { select?: TSelect },
  ): Promise<Prisma.MaterialGetPayload<{ select: TSelect }>> {
    const select = (options?.select ?? ({ id: true } as TSelect)) as TSelect;

    const material = await this.prisma.material.findFirst({
      where: {
        id: materialId,
        status: MaterialStatus.APPROVED,
        fileSafetyStatus: FileSafetyStatus.PASSED,
      },
      select,
    });

    if (!material) {
      throw new NotFoundException('Material not found or not approved');
    }

    return material as Prisma.MaterialGetPayload<{ select: TSelect }>;
  }

  private async ensurePublicApprovedMaterial<TSelect extends Prisma.MaterialSelect>(
    materialId: string,
    options?: { select?: TSelect },
  ): Promise<Prisma.MaterialGetPayload<{ select: TSelect }>> {
    const select = (options?.select ?? ({ id: true } as TSelect)) as TSelect;

    const material = await this.prisma.material.findFirst({
      where: {
        id: materialId,
        status: MaterialStatus.APPROVED,
        visibility: MaterialVisibility.PUBLIC,
        fileSafetyStatus: FileSafetyStatus.PASSED,
      },
      select,
    });

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    return material as Prisma.MaterialGetPayload<{ select: TSelect }>;
  }

  private async ensureDownloadablePublicMaterial(materialId: string): Promise<{ id: string; fileKey: string }> {
    const material = await this.ensurePublicApprovedMaterial(materialId, {
      select: {
        id: true,
        fileKey: true,
        fileSafetyStatus: true,
      },
    });

    if (material.fileSafetyStatus !== FileSafetyStatus.PASSED) {
      this.logger.warn({
        event: 'SECURITY_ALERT_DOWNLOAD_BLOCKED',
        materialId,
        fileSafetyStatus: material.fileSafetyStatus ?? null,
        timestamp: new Date().toISOString(),
      });
      throw new NotFoundException('Material not found');
    }

    return {
      id: material.id,
      fileKey: material.fileKey,
    };
  }

  private buildApprovedWhere(query: MaterialSearchQueryDto): Prisma.MaterialWhereInput {
    return {
      status: MaterialStatus.APPROVED,
      visibility: MaterialVisibility.PUBLIC,
      // Only surface materials whose file passed the async scan (or predates it,
      // i.e. null), matching the keyword raw-SQL branch and the detail/download
      // guard. Without this, APPROVED-but-QUARANTINED/SCANNING/FAILED/TIMEOUT
      // rows leak into list/RATING results and then 404 on click/download.
      AND: [{ OR: [{ fileSafetyStatus: FileSafetyStatus.PASSED }, { fileSafetyStatus: null }] }],
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.stage ? { stage: { equals: query.stage, mode: 'insensitive' } } : {}),
      ...(query.grade ? { grade: { equals: query.grade, mode: 'insensitive' } } : {}),
      ...(query.subject ? { subject: { equals: query.subject, mode: 'insensitive' } } : {}),
      ...(typeof query.year === 'number' ? { year: query.year } : {}),
      ...(query.region ? { region: { equals: query.region, mode: 'insensitive' } } : {}),
    };
  }

  private buildOrderBy(sort: MaterialSort, hasKeyword: boolean): Prisma.MaterialOrderByWithRelationInput[] {
    if (sort === MaterialSort.DOWNLOADS) {
      return [{ downloads: { _count: 'desc' } }, { createdAt: 'desc' }];
    }

    if (sort === MaterialSort.RATING) {
      return [{ createdAt: 'desc' }];
    }

    if (sort === MaterialSort.RELEVANCE) {
      return hasKeyword
        ? [{ downloads: { _count: 'desc' } }, { createdAt: 'desc' }]
        : [{ createdAt: 'desc' }];
    }

    return [{ createdAt: 'desc' }];
  }
}
