/// <reference path="../src/types/express.d.ts" />
import assert from 'node:assert/strict';
import { UnprocessableEntityException } from '@nestjs/common';
import { assertUploadFileSize, getMaxUploadSizeMb } from '../src/modules/materials/upload-security.util';
import { UploadFileInput } from '../src/modules/materials/file-upload.type';

function createFile(size: number): UploadFileInput {
  return {
    originalname: 'demo.txt',
    mimetype: 'text/plain',
    size,
    buffer: Buffer.alloc(size, 'a'),
  };
}

async function run(): Promise<void> {
  const maxUploadSizeMb = getMaxUploadSizeMb('1');
  const oneMb = 1024 * 1024;

  assert.doesNotThrow(() => {
    assertUploadFileSize(createFile(oneMb - 1), maxUploadSizeMb);
  });

  assert.doesNotThrow(() => {
    assertUploadFileSize(createFile(oneMb), maxUploadSizeMb);
  });

  assert.throws(
    () => {
      assertUploadFileSize(createFile(oneMb + 1), maxUploadSizeMb);
    },
    (error: unknown) => {
      assert.ok(error instanceof UnprocessableEntityException);
      assert.equal(error.message, 'UPLOAD_FILE_TOO_LARGE: max 1MB');
      return true;
    },
  );

  console.log('min-material-upload-size-boundary-check passed');
}

run().catch((error) => {
  console.error('min-material-upload-size-boundary-check failed:', error);
  // Force-exit: a failed run may still hold the Nest HTTP server open,
  // which would hang the runner/CI instead of failing fast.
  process.exit(1);
});
