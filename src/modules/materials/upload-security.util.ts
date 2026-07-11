import { UnprocessableEntityException } from '@nestjs/common';
import { FileSafetyStatus } from '@prisma/client';
import { extname } from 'path';
import { UploadFileInput } from './file-upload.type';

export const MAX_UPLOAD_SIZE_MB_KEY = 'MAX_UPLOAD_SIZE_MB';
export const DEFAULT_MAX_UPLOAD_SIZE_MB = 50;

export type UploadSecurityStatus = FileSafetyStatus;

type SupportedType = 'pdf' | 'docx' | 'pptx' | 'zip' | 'text';

type FilePolicy = {
  type: SupportedType;
  mimes: readonly string[];
  exts: readonly string[];
};

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

const FILE_POLICIES: readonly FilePolicy[] = [
  {
    type: 'pdf',
    mimes: ['application/pdf'],
    exts: ['.pdf'],
  },
  {
    type: 'docx',
    mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    exts: ['.docx'],
  },
  {
    type: 'pptx',
    mimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    exts: ['.pptx'],
  },
  {
    type: 'zip',
    mimes: ['application/zip'],
    exts: ['.zip'],
  },
  {
    type: 'text',
    mimes: ['text/plain'],
    exts: ['.txt', '.text', '.md', '.csv', '.log'],
  },
] as const;

const MIME_TO_TYPE = new Map(FILE_POLICIES.flatMap((policy) => policy.mimes.map((mime) => [mime, policy.type])));
const EXT_TO_TYPE = new Map(FILE_POLICIES.flatMap((policy) => policy.exts.map((ext) => [ext, policy.type])));

export const ALLOWED_MIME_TYPES = FILE_POLICIES.flatMap((policy) => [...policy.mimes]);

export function getMaxUploadSizeMb(raw: string | undefined): number {
  const maxUploadSizeMb = Number(raw ?? String(DEFAULT_MAX_UPLOAD_SIZE_MB));

  return Number.isFinite(maxUploadSizeMb) && maxUploadSizeMb > 0
    ? maxUploadSizeMb
    : DEFAULT_MAX_UPLOAD_SIZE_MB;
}

export function assertUploadFileSize(file: UploadFileInput, maxSizeMb: number): void {
  const maxBytes = maxSizeMb * 1024 * 1024;

  if (file.size > maxBytes) {
    throw new UnprocessableEntityException(`UPLOAD_FILE_TOO_LARGE: max ${maxSizeMb}MB`);
  }
}

export function assertUploadFileSecurity(file: UploadFileInput): UploadSecurityStatus {
  const typeByMime = MIME_TO_TYPE.get(file.mimetype);
  if (!typeByMime) {
    throw new UnprocessableEntityException('UNSUPPORTED_FILE_TYPE');
  }

  const extension = extname(file.originalname).toLowerCase();
  const typeByExt = EXT_TO_TYPE.get(extension);

  if (!typeByExt || typeByExt !== typeByMime) {
    throw new UnprocessableEntityException('FILE_EXTENSION_MISMATCH');
  }

  assertMagicAndStructure(typeByMime, file.buffer);

  return FileSafetyStatus.PASSED;
}

function assertMagicAndStructure(type: SupportedType, payload: Buffer): void {
  switch (type) {
    case 'pdf':
      assertPdf(payload);
      return;
    case 'docx':
      assertDocx(payload);
      return;
    case 'pptx':
      assertPptx(payload);
      return;
    case 'zip':
      assertZip(payload);
      return;
    case 'text':
      assertText(payload);
      return;
  }
}

function assertPdf(payload: Buffer): void {
  if (payload.length < 8) {
    throw new UnprocessableEntityException('INVALID_PDF_STRUCTURE');
  }

  const header = payload.subarray(0, 5).toString('ascii');
  if (header !== '%PDF-') {
    throw new UnprocessableEntityException('INVALID_FILE_SIGNATURE');
  }

  if (!payload.includes(Buffer.from('%%EOF'))) {
    throw new UnprocessableEntityException('INVALID_PDF_STRUCTURE');
  }
}

function assertZip(payload: Buffer): void {
  if (payload.length < 22) {
    throw new UnprocessableEntityException('INVALID_ZIP_STRUCTURE');
  }

  const hasLocalHeader = payload.includes(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const hasCentralDirectory = payload.includes(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const hasEndOfCentralDirectory = payload.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]));

  if (!hasLocalHeader || !hasCentralDirectory || !hasEndOfCentralDirectory) {
    throw new UnprocessableEntityException('INVALID_ZIP_STRUCTURE');
  }
}

function assertDocx(payload: Buffer): void {
  assertZip(payload);
  const zipView = payload.toString('latin1');
  if (!zipView.includes('[Content_Types].xml') || !zipView.includes('word/')) {
    throw new UnprocessableEntityException('INVALID_DOCX_STRUCTURE');
  }
}

function assertPptx(payload: Buffer): void {
  assertZip(payload);
  const zipView = payload.toString('latin1');
  if (!zipView.includes('[Content_Types].xml') || !zipView.includes('ppt/')) {
    throw new UnprocessableEntityException('INVALID_PPTX_STRUCTURE');
  }
}

function assertText(payload: Buffer): void {
  if (payload.includes(0)) {
    throw new UnprocessableEntityException('INVALID_TEXT_STRUCTURE');
  }

  try {
    UTF8_DECODER.decode(payload);
  } catch {
    throw new UnprocessableEntityException('INVALID_TEXT_STRUCTURE');
  }
}


/**
 * Recover the user-facing filename (with extension) from an object key of the
 * form `${date}/${uuid}-${sanitized-name}`. The stored name was produced by
 * sanitizeFilename, but re-filter defensively (legacy keys) so callers can
 * embed the result in headers/JSON without injection concerns.
 */
export function displayNameFromFileKey(fileKey: string, fallback: string): string {
  const base = fileKey.split("/").pop() ?? "";
  const withoutUuid = base.replace(
    /^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}-/,
    "",
  );
  const safe = withoutUuid.replace(/[^A-Za-z0-9._-]/g, "_");
  return safe || fallback;
}

export function sanitizeFilename(name: string): string {
  const withoutControl = name.replace(/[\u0000-\u001F\u007F]/g, "");
  const basename = withoutControl.split(/[\/\\]/).pop() ?? "file";
  const dotIndex = basename.lastIndexOf(".");
  const ext = dotIndex > 0 ? basename.slice(dotIndex) : "";
  const body = dotIndex > 0 ? basename.slice(0, dotIndex) : basename;
  const safeBody = body.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  const safeExt = ext.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_");
  const fallbackBody = safeBody || "file";
  const maxLen = 120;
  const extLen = safeExt.length;
  const bodyLimit = Math.max(1, maxLen - extLen);
  const trimmedBody = fallbackBody.slice(0, bodyLimit);
  const combined = `${trimmedBody}${safeExt}`.slice(0, maxLen);
  return combined || "file";
}

export function stripControlChars(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F]/g, "");
}
