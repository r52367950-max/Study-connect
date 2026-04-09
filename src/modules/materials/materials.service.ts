import { Injectable, NotFoundException } from '@nestjs/common';
import { Material, MaterialStatus, MaterialVisibility, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { MinioService, PrismaService } from '../../infra';
import { CreateMaterialDto } from './dto/create-material.dto';
import { MaterialSearchQueryDto, MaterialSort } from './dto/material-search-query.dto';
import { UploadFileInput } from './file-upload.type';

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
>;

@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
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
      },
    });

    return material;
  }

  async searchApproved(query: MaterialSearchQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const skip = (page - 1) * pageSize;

    const where = this.buildApprovedWhere(query);
    const orderBy = this.buildOrderBy(query.sort ?? MaterialSort.LATEST, Boolean(query.q));

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
    const material = await this.prisma.material.findFirst({
      where: {
        id,
        status: MaterialStatus.APPROVED,
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

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    const aggregate = await this.prisma.rating.aggregate({
      where: { materialId: material.id },
      _avg: { score: true },
    });

    const { _count, ...base } = material;
    return {
      ...base,
      avg_score: aggregate._avg.score ?? null,
      download_count: _count.downloads,
    };
  }

  async downloadApprovedMaterial(materialId: string, userId: string) {
    const material = await this.prisma.material.findFirst({
      where: {
        id: materialId,
        status: MaterialStatus.APPROVED,
      },
      select: {
        id: true,
        fileKey: true,
      },
    });

    if (!material) {
      throw new NotFoundException('Material is not available for download');
    }

    await this.prisma.download.create({
      data: {
        userId,
        materialId: material.id,
      },
    });

    return {
      materialId: material.id,
      downloadUrl: this.minioService.getObjectUrl(material.fileKey),
      message: 'Download recorded',
    };
  }

  private buildApprovedWhere(query: MaterialSearchQueryDto): Prisma.MaterialWhereInput {
    return {
      status: MaterialStatus.APPROVED,
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
      return [{ ratings: { _count: 'desc' } }, { createdAt: 'desc' }];
    }

    if (sort === MaterialSort.RELEVANCE) {
      return hasKeyword
        ? [{ downloads: { _count: 'desc' } }, { createdAt: 'desc' }]
        : [{ createdAt: 'desc' }];
    }

    return [{ createdAt: 'desc' }];
  }
}
