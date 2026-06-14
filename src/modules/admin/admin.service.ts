import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { MaterialStatus, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../infra';

type AuditContext = {
  ip?: string;
  userAgent?: string;
};

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

  async getAuditLogs(query: { targetId?: string; adminId?: string; page: number; pageSize: number }) {
    const skip = (query.page - 1) * query.pageSize;
    const where: Prisma.AdminAuditLogWhereInput = {
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.adminId ? { adminId: query.adminId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    return {
      page: query.page,
      pageSize: query.pageSize,
      total,
      items,
    };
  }

  async getMaterialScanDetails(materialId: string) {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      select: { id: true, title: true, status: true, fileSafetyStatus: true },
    });

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    const scanJob = await this.prisma.fileScanJob.findUnique({
      where: { materialId },
      include: {
        reports: { orderBy: { createdAt: 'desc' } },
      },
    });

    return { material, scanJob };
  }

  async approveMaterial(materialId: string, adminId: string, context: AuditContext = {}) {
    return this.updateMaterialReview(
      materialId,
      {
        status: MaterialStatus.APPROVED,
        reviewComment: 'Approved',
      },
      {
        adminId,
        action: 'MATERIAL_APPROVE',
        reason: null,
        ...context,
      },
    );
  }

  async offlineMaterial(materialId: string, adminId: string, reviewComment?: string, context: AuditContext = {}) {
    const businessComment = reviewComment?.trim() || 'Offline';
    return this.updateMaterialReview(
      materialId,
      {
        status: MaterialStatus.OFFLINE,
        reviewComment: businessComment,
      },
      {
        adminId,
        action: 'MATERIAL_OFFLINE',
        reason: businessComment,
        ...context,
      },
    );
  }

  async rejectMaterial(materialId: string, reason: string, adminId: string, context: AuditContext = {}) {
    return this.updateMaterialReview(
      materialId,
      {
        status: MaterialStatus.REJECTED,
        reviewComment: reason,
      },
      {
        adminId,
        action: 'MATERIAL_REJECT',
        reason,
        ...context,
      },
    );
  }

  async banUser(userId: string, adminId: string, context: AuditContext = {}) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, status: true, tokenVersion: true },
        });

        if (!before) {
          throw this.createRecordNotFoundError();
        }

        const updated = await tx.user.update({
          where: { id: userId },
          data: {
            status: UserStatus.BANNED,
            tokenVersion: { increment: 1 },
          },
          select: {
            id: true,
            status: true,
            tokenVersion: true,
          },
        });

        await tx.adminAuditLog.create({
          data: {
            adminId,
            action: 'USER_BAN',
            targetType: 'USER',
            targetId: userId,
            before,
            after: updated,
            reason: null,
            ip: context.ip,
            userAgent: context.userAgent,
          },
        });

        return {
          id: updated.id,
          status: updated.status,
        };
      });
    } catch (error) {
      if (this.isRecordNotFoundError(error)) {
        throw new NotFoundException('User not found');
      }
      throw error;
    }
  }

  private async updateMaterialReview(
    materialId: string,
    data: { status: MaterialStatus; reviewComment: string },
    audit: { adminId: string; action: string; reason: string | null; ip?: string; userAgent?: string },
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await tx.material.findUnique({
          where: { id: materialId },
          select: { id: true, status: true, reviewComment: true },
        });

        if (!before) {
          throw this.createRecordNotFoundError();
        }

        const updated = await tx.material.update({
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

        await tx.adminAuditLog.create({
          data: {
            adminId: audit.adminId,
            action: audit.action,
            targetType: 'MATERIAL',
            targetId: materialId,
            before,
            after: updated,
            reason: audit.reason,
            ip: audit.ip,
            userAgent: audit.userAgent,
          },
        });

        return updated;
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

  private createRecordNotFoundError() {
    return { code: 'P2025', message: 'Record to update not found.' };
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
