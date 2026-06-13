import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  MaterialAppealStatus,
  MaterialReportStatus,
  MaterialStatus,
  MaterialVersionStatus,
  UserStatus,
} from '@prisma/client';
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
        select: { id: true, title: true, subject: true, stage: true, grade: true, createdAt: true, uploader: { select: { username: true } } },
      }),
      this.prisma.material.count({ where: { status: MaterialStatus.PENDING } }),
    ]);

    return { page, pageSize, total, items };
  }

  async getReports(page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.materialReport.findMany({
        orderBy: { createdAt: 'desc' }, skip, take: pageSize,
        include: { material: { select: { id: true, title: true, status: true } }, reporter: { select: { username: true } }, reviewer: { select: { username: true } } },
      }),
      this.prisma.materialReport.count(),
    ]);
    return { page, pageSize, total, items };
  }

  async getMaterialModerationHistory(materialId: string) {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      select: {
        id: true, title: true, status: true, reviewComment: true,
        reports: { orderBy: { createdAt: 'desc' }, include: { reporter: { select: { username: true } }, reviewer: { select: { username: true } } } },
        appeals: { orderBy: { createdAt: 'desc' }, include: { submitter: { select: { username: true } }, reviewer: { select: { username: true } } } },
        versions: { orderBy: { createdAt: 'desc' }, include: { submitter: { select: { username: true } }, reviewer: { select: { username: true } } } },
        auditLogs: { orderBy: { createdAt: 'desc' }, include: { admin: { select: { username: true } } } },
      },
    });
    if (!material) throw new NotFoundException('Material not found');
    return material;
  }

  async approveMaterial(materialId: string, adminId: string) {
    return this.updateMaterialReview(materialId, adminId, MaterialStatus.APPROVED, `Approved by ${adminId}`, AuditAction.MATERIAL_APPROVE);
  }

  async restoreMaterial(materialId: string, adminId: string, reason: string) {
    return this.updateMaterialReview(materialId, adminId, MaterialStatus.APPROVED, reason, AuditAction.MATERIAL_RESTORE);
  }

  async offlineMaterial(materialId: string, adminId: string, reviewComment?: string) {
    return this.updateMaterialReview(materialId, adminId, MaterialStatus.OFFLINE, reviewComment?.trim() || `Offline by ${adminId}`, AuditAction.MATERIAL_OFFLINE);
  }

  async rejectMaterial(materialId: string, reason: string, adminId: string) {
    return this.updateMaterialReview(materialId, adminId, MaterialStatus.REJECTED, `[${adminId}] ${reason}`, AuditAction.MATERIAL_REJECT);
  }

  async processReport(reportId: string, adminId: string, dto: { status: MaterialReportStatus; reason: string; offlineMaterial?: boolean; restoreMaterial?: boolean }) {
    return this.prisma.$transaction(async (tx) => {
      const prev = await tx.materialReport.findUnique({ where: { id: reportId }, include: { material: { select: { status: true } } } });
      if (!prev) throw new NotFoundException('Report not found');
      const report = await tx.materialReport.update({ where: { id: reportId }, data: { status: dto.status, adminReason: dto.reason, reviewedBy: adminId, reviewedAt: new Date() } });
      if (dto.offlineMaterial) await tx.material.update({ where: { id: prev.materialId }, data: { status: MaterialStatus.OFFLINE, reviewComment: dto.reason } });
      if (dto.restoreMaterial) await tx.material.update({ where: { id: prev.materialId }, data: { status: MaterialStatus.APPROVED, reviewComment: dto.reason } });
      await tx.materialAuditLog.create({ data: { materialId: prev.materialId, adminId, action: AuditAction.MATERIAL_REPORT_STATUS_CHANGE, reason: dto.reason, previousStatus: prev.status, nextStatus: dto.status, reportId } });
      return report;
    });
  }

  async processAppeal(appealId: string, adminId: string, dto: { status: MaterialAppealStatus; reason: string; restoreMaterial?: boolean }) {
    return this.prisma.$transaction(async (tx) => {
      const prev = await tx.materialAppeal.findUnique({ where: { id: appealId } });
      if (!prev) throw new NotFoundException('Appeal not found');
      const appeal = await tx.materialAppeal.update({ where: { id: appealId }, data: { status: dto.status, adminReason: dto.reason, reviewedBy: adminId, reviewedAt: new Date() } });
      if (dto.restoreMaterial || dto.status === MaterialAppealStatus.APPROVED) await tx.material.update({ where: { id: prev.materialId }, data: { status: MaterialStatus.APPROVED, reviewComment: dto.reason } });
      await tx.materialAuditLog.create({ data: { materialId: prev.materialId, adminId, action: AuditAction.MATERIAL_APPEAL_STATUS_CHANGE, reason: dto.reason, previousStatus: prev.status, nextStatus: dto.status, appealId } });
      return appeal;
    });
  }

  async processVersion(versionId: string, adminId: string, dto: { status: MaterialVersionStatus; reason: string; restoreMaterial?: boolean }) {
    return this.prisma.$transaction(async (tx) => {
      const prev = await tx.materialVersion.findUnique({ where: { id: versionId } });
      if (!prev) throw new NotFoundException('Version not found');
      const version = await tx.materialVersion.update({ where: { id: versionId }, data: { status: dto.status, adminReason: dto.reason, reviewedBy: adminId, reviewedAt: new Date() } });
      if (dto.status === MaterialVersionStatus.APPROVED) await tx.material.update({ where: { id: prev.materialId }, data: { fileKey: prev.fileKey, status: dto.restoreMaterial ? MaterialStatus.APPROVED : undefined, reviewComment: dto.reason } });
      await tx.materialAuditLog.create({ data: { materialId: prev.materialId, adminId, action: AuditAction.MATERIAL_VERSION_STATUS_CHANGE, reason: dto.reason, previousStatus: prev.status, nextStatus: dto.status, versionId } });
      return version;
    });
  }

  async banUser(userId: string) {
    try {
      return await this.prisma.user.update({ where: { id: userId }, data: { status: UserStatus.BANNED, tokenVersion: { increment: 1 } }, select: { id: true, status: true } });
    } catch (error) { if (this.isRecordNotFoundError(error)) throw new NotFoundException('User not found'); throw error; }
  }

  private async updateMaterialReview(materialId: string, adminId: string, status: MaterialStatus, reviewComment: string, action: AuditAction) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const prev = await tx.material.findUnique({ where: { id: materialId }, select: { status: true } });
        if (!prev) throw new NotFoundException('Material not found');
        const material = await tx.material.update({ where: { id: materialId }, data: { status, reviewComment }, select: { id: true, status: true, reviewComment: true, updatedAt: true } });
        await tx.materialAuditLog.create({ data: { materialId, adminId, action, reason: reviewComment, previousStatus: prev.status, nextStatus: status } });
        return material;
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to update material review (materialId=${materialId}, targetStatus=${status}, errorType=${this.getErrorType(error)})`, error instanceof Error ? error.stack : undefined);
      if (this.isRecordNotFoundError(error)) throw new NotFoundException('Material not found');
      throw new InternalServerErrorException('Failed to update material review');
    }
  }

  private isRecordNotFoundError(error: unknown): boolean { return !!error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2025'; }
  private getErrorType(error: unknown): string { return error && typeof error === 'object' && 'constructor' in error ? (error as { constructor?: { name?: string } }).constructor?.name ?? 'object' : typeof error; }
}
