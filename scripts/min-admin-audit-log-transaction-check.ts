import assert from 'node:assert/strict';
import { MaterialStatus } from '@prisma/client';
import { AdminService } from '../src/modules/admin/admin.service';

type MaterialRow = {
  id: string;
  status: MaterialStatus;
  reviewComment: string | null;
  updatedAt: Date;
};

type AuditRow = {
  id: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  reason: string | null;
};

class TransactionalPrismaMock {
  materials = new Map<string, MaterialRow>();
  auditLogs: AuditRow[] = [];
  failAuditCreate = false;

  material = {
    findUnique: async ({ where }: { where: { id: string } }) => this.materials.get(where.id) ?? null,
    update: async ({ where, data, select }: { where: { id: string }; data: Partial<MaterialRow>; select: Record<string, boolean> }) => {
      const row = this.materials.get(where.id);
      if (!row) throw { code: 'P2025' };
      const updated = { ...row, ...data, updatedAt: new Date() };
      this.materials.set(where.id, updated);
      return this.pick(updated, select);
    },
  };

  adminAuditLog = {
    create: async ({ data }: { data: Omit<AuditRow, 'id'> }) => {
      if (this.failAuditCreate) throw new Error('audit insert failed');
      const row = { id: crypto.randomUUID(), ...data };
      this.auditLogs.push(row);
      return row;
    },
  };

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    const materialSnapshot = new Map(this.materials);
    const auditSnapshot = [...this.auditLogs];
    try {
      return await callback(this);
    } catch (error) {
      this.materials = materialSnapshot;
      this.auditLogs = auditSnapshot;
      throw error;
    }
  }

  private pick(row: MaterialRow, select: Record<string, boolean>) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(select)) {
      if (select[key]) out[key] = (row as unknown as Record<string, unknown>)[key];
    }
    return out;
  }
}

async function run(): Promise<void> {
  const prisma = new TransactionalPrismaMock();
  const service = new AdminService(prisma as never);
  const materialId = crypto.randomUUID();
  const adminId = crypto.randomUUID();

  prisma.materials.set(materialId, {
    id: materialId,
    status: MaterialStatus.PENDING,
    reviewComment: null,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });

  const approved = await service.approveMaterial(materialId, adminId, { ip: '127.0.0.1', userAgent: 'regression' });
  assert.equal(approved.status, MaterialStatus.APPROVED);
  assert.equal(approved.reviewComment, 'Approved');
  assert.equal(prisma.auditLogs.length, 1);
  assert.equal(prisma.auditLogs[0].adminId, adminId);
  assert.equal(prisma.auditLogs[0].action, 'MATERIAL_APPROVE');
  assert.equal(prisma.auditLogs[0].targetId, materialId);

  prisma.failAuditCreate = true;
  await assert.rejects(service.rejectMaterial(materialId, 'bad content', adminId), /Failed to update material review/);

  const afterRollback = prisma.materials.get(materialId);
  assert.equal(afterRollback?.status, MaterialStatus.APPROVED);
  assert.equal(afterRollback?.reviewComment, 'Approved');
  assert.equal(prisma.auditLogs.length, 1);

  console.log('min-admin-audit-log-transaction-check passed');
}

run().catch((error) => {
  console.error('min-admin-audit-log-transaction-check failed:', error);
  // Force-exit: a failed run may still hold the Nest HTTP server open,
  // which would hang the runner/CI instead of failing fast.
  process.exit(1);
});
