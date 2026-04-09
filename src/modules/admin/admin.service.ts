import { Injectable, NotFoundException } from '@nestjs/common';
import { MaterialStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra';

export type PendingMaterialsResult = {
  page: number;
  limit: number;
  total: number;
  items: Array<{
    id: string;
    title: string;
    status: MaterialStatus;
    uploaderId: string;
    createdAt: Date;
    updatedAt: Date;
    reviewComment: string | null;
  }>;
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listPending(page: number, limit: number): Promise<PendingMaterialsResult> {
    const skip = (page - 1) * limit;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.material.count({ where: { status: MaterialStatus.PENDING } }),
      this.prisma.material.findMany({
        where: { status: MaterialStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          status: true,
          uploaderId: true,
          createdAt: true,
          updatedAt: true,
          reviewComment: true,
        },
      }),
    ]);

    return {
      page,
      limit,
      total,
      items,
    };
  }

  async approveMaterial(id: string) {
    return this.updateStatusOrThrow(id, {
      status: MaterialStatus.APPROVED,
      reviewComment: 'Approved by admin',
    });
  }

  async rejectMaterial(id: string, reason: string) {
    return this.updateStatusOrThrow(id, {
      status: MaterialStatus.REJECTED,
      reviewComment: reason,
    });
  }

  private async updateStatusOrThrow(id: string, data: Prisma.MaterialUpdateInput) {
    try {
      return await this.prisma.material.update({
        where: { id },
        data,
        select: {
          id: true,
          status: true,
          reviewComment: true,
          updatedAt: true,
        },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Material not found');
      }

      throw error;
    }
  }
}
