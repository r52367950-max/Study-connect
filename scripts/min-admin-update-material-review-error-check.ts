import assert from 'node:assert/strict';
import { InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { MaterialStatus } from '@prisma/client';
import { AdminService } from '../src/modules/admin/admin.service';

function createServiceWithUpdateError(errorToThrow: unknown) {
  const prismaMock = {
    material: {
      update: async () => {
        throw errorToThrow;
      },
    },
  };

  const service = new AdminService(prismaMock as never);
  return service;
}

async function run(): Promise<void> {
  const originalError = Logger.prototype.error;
  const errorLogs: string[] = [];

  Logger.prototype.error = function (message: unknown) {
    errorLogs.push(String(message));
  };

  try {
    const notFoundService = createServiceWithUpdateError({ code: 'P2025', message: 'Record to update not found.' });

    await assert.rejects(
      (notFoundService as unknown as { updateMaterialReview: Function }).updateMaterialReview('missing-id', {
        status: MaterialStatus.APPROVED,
        reviewComment: 'Approved by admin',
      }),
      (error: unknown) => {
        assert.ok(error instanceof NotFoundException);
        return true;
      },
    );

    const dbFailureService = createServiceWithUpdateError(new Error('database connection lost'));

    await assert.rejects(
      (dbFailureService as unknown as { updateMaterialReview: Function }).updateMaterialReview('material-1', {
        status: MaterialStatus.REJECTED,
        reviewComment: 'rejected',
      }),
      (error: unknown) => {
        assert.ok(error instanceof InternalServerErrorException);
        return true;
      },
    );

    assert.equal(errorLogs.length, 2);
    assert.ok(errorLogs[0].includes('materialId=missing-id'));
    assert.ok(errorLogs[1].includes('materialId=material-1'));

    console.log('min-admin-update-material-review-error-check passed');
  } finally {
    Logger.prototype.error = originalError;
  }
}

run().catch((error) => {
  console.error('min-admin-update-material-review-error-check failed:', error);
  process.exitCode = 1;
});
