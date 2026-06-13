import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  FileSafetyStatus,
  Material,
  MaterialStatus,
  MaterialVisibility,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { MinioService, PrismaService } from "../../infra";
import { CreateMaterialDto } from "./dto/create-material.dto";
import { CreateRatingDto } from "./dto/create-rating.dto";
import { MaterialRatingsQueryDto } from "./dto/material-ratings-query.dto";
import { MaterialSearchQueryDto } from "./dto/material-search-query.dto";
import { UploadFileInput } from "./file-upload.type";
import { FileScanService } from "./file-scan.service";
import { sanitizeFilename, stripControlChars } from "./upload-security.util";
import {
  MATERIAL_SEARCH_ENGINE,
  MaterialSearchEngine,
} from "./search/material-search-engine";

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

@Injectable()
export class MaterialsService {
  private readonly logger = new Logger(MaterialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
    private readonly fileScanService: FileScanService,
    @Inject(MATERIAL_SEARCH_ENGINE)
    private readonly searchEngine: MaterialSearchEngine,
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
    return this.searchEngine.searchApproved(query);
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

  async downloadApprovedMaterial(materialId: string, userId: string) {
    const material = await this.ensureDownloadablePublicMaterial(materialId);

    // Atomic pair: the download row and the denormalized counter move together,
    // so list/detail sort orders never drift from the downloads table.
    const [download] = await this.prisma.$transaction([
      this.prisma.download.create({
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
      }),
      this.prisma.material.update({
        where: { id: material.id },
        data: { downloadCount: { increment: 1 } },
        select: { id: true },
      }),
    ]);

    return {
      materialId: material.id,
      downloadUrl: this.minioService.getSignedDownloadUrl(material.fileKey),
      downloadRecord: download,
    };
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

  private async ensureDownloadablePublicMaterial(
    materialId: string,
  ): Promise<{ id: string; fileKey: string }> {
    const material = await this.ensurePublicApprovedMaterial(materialId, {
      select: {
        id: true,
        fileKey: true,
        fileSafetyStatus: true,
      },
    });

    // Defense-in-depth tripwire: ensurePublicApprovedMaterial only returns PASSED/null rows,
    // but if its filter ever regresses, block the download here and raise the alert.
    if (
      material.fileSafetyStatus !== FileSafetyStatus.PASSED &&
      material.fileSafetyStatus !== null
    ) {
      this.logger.warn({
        event: "SECURITY_ALERT_DOWNLOAD_BLOCKED",
        materialId,
        fileSafetyStatus: material.fileSafetyStatus,
        timestamp: new Date().toISOString(),
      });
      throw new NotFoundException("Material not found");
    }

    return {
      id: material.id,
      fileKey: material.fileKey,
    };
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
