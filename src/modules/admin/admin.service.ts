import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { MaterialStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../infra';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

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
          subject: true,
          stage: true,
          grade: true,
          createdAt: true,
          uploader: {
            select: {
              username: true,
            },
          },
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

  async offlineMaterial(materialId: string, adminId: string, reviewComment?: string) {
    return this.updateMaterialReview(materialId, {
      status: MaterialStatus.OFFLINE,
      reviewComment: reviewComment?.trim() || `Offline by ${adminId}`,
    });
  }

  async rejectMaterial(materialId: string, reason: string, adminId: string) {
    return this.updateMaterialReview(materialId, {
      status: MaterialStatus.REJECTED,
      reviewComment: `[${adminId}] ${reason}`,
    });
  }

  async banUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.BANNED,
        tokenVersion: { increment: 1 },
      },
      select: {
        id: true,
        status: true,
      },
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
    } catch (error) {
      this.logger.error(
        `Failed to update material review (materialId=${materialId}, targetStatus=${data.status}, errorType=${this.getErrorType(error)})`,
        error instanceof Error ? error.stack : undefined,
      );

      if (this.isRecordNotFoundError(error)) {
        throw new NotFoundException('Material not found');
      }

      throw new InternalServerErrorException('Failed to update material review');
    }
  }

  private isRecordNotFoundError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const maybeCode = (error as { code?: unknown }).code;
    return maybeCode === 'P2025';
  }

  private getErrorType(error: unknown): string {
    if (error && typeof error === 'object' && 'constructor' in error) {
      const constructorName = (error as { constructor?: { name?: string } }).constructor?.name;
      if (constructorName) {
        return constructorName;
      }
    }

    return typeof error;
  }
}
