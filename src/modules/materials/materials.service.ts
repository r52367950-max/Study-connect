import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Material, MaterialStatus, MaterialVisibility, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { MinioService, PrismaService } from '../../infra';
import { CreateMaterialDto } from './dto/create-material.dto';
import { CreateRatingDto } from './dto/create-rating.dto';
import { MaterialRatingsQueryDto } from './dto/material-ratings-query.dto';
import { MaterialSearchQueryDto, MaterialSort } from './dto/material-search-query.dto';
import { UploadFileInput } from './file-upload.type';
import { FileScanService } from './file-scan.service';

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
    const safeName = params.file.originalname.replace(/\s+/g, '-');
    const key = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName}`;

    await this.minioService.uploadObject(key, params.file.buffer, params.file.mimetype);

    const material = await this.prisma.material.create({
      data: {
        title: params.dto.title,
        description: params.dto.description,
        stage: params.dto.stage,
        grade: params.dto.grade,
        subject: params.dto.subject,
        year: params.dto.year,
        region: params.dto.region,
        visibility: params.dto.visibility ?? MaterialVisibility.PUBLIC,
        status: MaterialStatus.PENDING,
        fileKey: key,
        uploaderId: params.uploaderId,
        fileSafetyStatus: 'QUARANTINED',
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

    this.fileScanService.enqueueScan(material.id, params.file);

    return material;
  }

  async searchApproved(query: MaterialSearchQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const skip = (page - 1) * pageSize;
    const sort = query.sort ?? MaterialSort.LATEST;

    const where = this.buildApprovedWhere(query);
    const orderBy = this.buildOrderBy(sort, Boolean(query.q));

    if (sort === MaterialSort.RATING) {
      const allItems = await this.prisma.material.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          title: true,
          description: true,
          stage: true,
          grade: true,
          subject: true,
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
      });

      const materialIds = allItems.map((item) => item.id);
      const [total, aggregates] = await Promise.all([
        this.prisma.material.count({ where }),
        materialIds.length
          ? this.prisma.rating.groupBy({
              by: ['materialId'],
              where: { materialId: { in: materialIds } },
              _avg: { score: true },
              _count: { score: true },
            })
          : Promise.resolve([]),
      ]);

      const aggregateMap = new Map(
        aggregates.map((row) => [row.materialId, { avgScore: row._avg.score, ratingCount: row._count.score }]),
      );

      const sortedItems = [...allItems].sort((left, right) => {
        const leftAggregate = aggregateMap.get(left.id);
        const rightAggregate = aggregateMap.get(right.id);

        const avgDiff = (rightAggregate?.avgScore ?? -1) - (leftAggregate?.avgScore ?? -1);
        if (avgDiff !== 0) {
          return avgDiff;
        }

        const countDiff = (rightAggregate?.ratingCount ?? 0) - (leftAggregate?.ratingCount ?? 0);
        if (countDiff !== 0) {
          return countDiff;
        }

        return right.createdAt.getTime() - left.createdAt.getTime();
      });

      const pagedItems = sortedItems.slice(skip, skip + pageSize);

      return {
        page,
        pageSize,
        total,
        items: pagedItems.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          stage: item.stage,
          grade: item.grade,
          subject: item.subject,
          year: item.year,
          region: item.region,
          visibility: item.visibility,
          createdAt: item.createdAt,
          avg_score: aggregateMap.get(item.id)?.avgScore ?? null,
          download_count: item._count.downloads,
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
    await this.ensureApprovedMaterial(params.materialId);

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
    await this.ensureApprovedMaterial(materialId);

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

    if (material.fileSafetyStatus !== 'PASSED') {
      this.logger.warn(
        JSON.stringify({
          event: 'SECURITY_ALERT_DOWNLOAD_BLOCKED',
          materialId,
          fileSafetyStatus: material.fileSafetyStatus ?? 'NULL',
          timestamp: new Date().toISOString(),
        }),
      );
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
