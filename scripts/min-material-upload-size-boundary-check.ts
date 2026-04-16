/// <reference path="../src/types/express.d.ts" />
import assert from 'node:assert/strict';
import { UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  assertUploadFileSize,
  getMaxUploadSizeMb,
  MAX_UPLOAD_SIZE_MB_KEY,
} from '../src/modules/materials/materials.controller';
import { UploadFileInput } from '../src/modules/materials/file-upload.type';

function createFile(size: number): UploadFileInput {
  return {
    originalname: 'demo.txt',
    mimetype: 'text/plain',
    size,
    buffer: Buffer.alloc(size, 'a'),
  };
}

function createConfig(maxUploadSizeMb: string): ConfigService {
  return {
    get: (key: string) => (key === MAX_UPLOAD_SIZE_MB_KEY ? maxUploadSizeMb : undefined),
  } as unknown as ConfigService;
}

async function run(): Promise<void> {
  const maxUploadSizeMb = getMaxUploadSizeMb(createConfig('1'));
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
  process.exitCode = 1;
});
