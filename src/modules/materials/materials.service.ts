import { Injectable } from '@nestjs/common';
import { Material, MaterialStatus, MaterialVisibility } from '@prisma/client';
import { randomUUID } from 'crypto';
import { MinioService, PrismaService } from '../../infra';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UploadFileInput } from './file-upload.type';

export type UploadedMaterial = Pick<
  Material,
  'id' | 'title' | 'description' | 'fileKey' | 'visibility' | 'status' | 'uploaderId' | 'createdAt'
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
        visibility: params.dto.visibility ?? MaterialVisibility.PUBLIC,
        status: MaterialStatus.PENDING,
        fileKey: key,
        uploaderId: params.uploaderId,
      },
      select: {
        id: true,
        title: true,
        description: true,
        fileKey: true,
        visibility: true,
        status: true,
        uploaderId: true,
        createdAt: true,
      },
    });

    return material;
  }
}
