import { FileSafetyStatus } from '@prisma/client';
import assert from 'node:assert/strict';
import { UnprocessableEntityException } from '@nestjs/common';
import { UploadFileInput } from '../src/modules/materials/file-upload.type';
import { assertUploadFileSecurity } from '../src/modules/materials/upload-security.util';

function createFile(params: {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}): UploadFileInput {
  return {
    originalname: params.originalname,
    mimetype: params.mimetype,
    buffer: params.buffer,
    size: params.buffer.length,
  };
}

function shouldReject(file: UploadFileInput, message: string): void {
  assert.throws(
    () => assertUploadFileSecurity(file),
    (error: unknown) => {
      assert.ok(error instanceof UnprocessableEntityException);
      assert.equal(error.message, message);
      return true;
    },
  );
}

function run(): void {
  const validPdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF', 'ascii');
  assert.equal(
    assertUploadFileSecurity(createFile({
      originalname: 'lesson.pdf',
      mimetype: 'application/pdf',
      buffer: validPdf,
    })),
    FileSafetyStatus.PASSED,
  );

  const forgedMime = Buffer.from('MZ fake executable', 'ascii');
  shouldReject(
    createFile({
      originalname: 'malware.pdf',
      mimetype: 'application/pdf',
      buffer: forgedMime,
    }),
    'INVALID_FILE_SIGNATURE',
  );

  shouldReject(
    createFile({
      originalname: 'safe.pdf.exe',
      mimetype: 'application/pdf',
      buffer: validPdf,
    }),
    'FILE_EXTENSION_MISMATCH',
  );

  const malformedZip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
  shouldReject(
    createFile({
      originalname: 'broken.zip',
      mimetype: 'application/zip',
      buffer: malformedZip,
    }),
    'INVALID_ZIP_STRUCTURE',
  );

  const pseudoDocx = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('word/document.xml [Content_Types].xml', 'latin1'),
    Buffer.from([0x50, 0x4b, 0x01, 0x02]),
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    Buffer.alloc(32),
  ]);
  assert.equal(
    assertUploadFileSecurity(
      createFile({
        originalname: 'ok.docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: pseudoDocx,
      }),
    ),
    FileSafetyStatus.PASSED,
  );

  console.log('min-material-upload-security-regression-check passed');
}

run();
