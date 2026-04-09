import { Injectable, NotFoundException } from '@nestjs/common';
import { MaterialStatus } from '@prisma/client';
import { PrismaService } from '../../infra';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getPendingMaterials(page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.material.findMany({
        where: { status: MaterialStatus.PENDING },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          reviewComment: true,
          uploaderId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.material.count({
        where: { status: MaterialStatus.PENDING },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items,
    };
  }

  async approveMaterial(materialId: string, adminId: string) {
    return this.updateMaterialReview(materialId, {
      status: MaterialStatus.APPROVED,
      reviewComment: `Approved by ${adminId}`,
    });
  }

  async rejectMaterial(materialId: string, reason: string, adminId: string) {
    return this.updateMaterialReview(materialId, {
      status: MaterialStatus.REJECTED,
      reviewComment: `[${adminId}] ${reason}`,
    });
  }

  private async updateMaterialReview(
    materialId: string,
    data: { status: MaterialStatus; reviewComment: string },
  ) {
    try {
      return await this.prisma.material.update({
        where: { id: materialId },
        data: {
          status: data.status,
          reviewComment: data.reviewComment,
        },
        select: {
          id: true,
          status: true,
          reviewComment: true,
          updatedAt: true,
        },
      });
    } catch {
      throw new NotFoundException('Material not found');
    }
  }
}
