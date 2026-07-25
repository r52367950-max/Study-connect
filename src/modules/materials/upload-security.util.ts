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

/** ZIP record signatures, little-endian. */
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_ENTRY_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;

const EOCD_MIN_SIZE = 22;
const CENTRAL_ENTRY_MIN_SIZE = 46;
const MAX_ZIP_COMMENT_SIZE = 0xffff;

/** Bounds the central-directory walk so a hostile header cannot spin the loop. */
const MAX_ZIP_ENTRIES = 4096;
/** Total declared inflated size we are willing to accept across all entries. */
const MAX_ZIP_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
/** Declared inflated:stored ratio above which the archive is treated as a bomb. */
const MAX_ZIP_COMPRESSION_RATIO = 200;

/**
 * How far back from EOF to look for the PDF `%%EOF` trailer. The marker belongs in
 * the trailer, and readers conventionally scan only the tail; bounding it keeps a
 * 50MB upload from being scanned end to end on every request.
 */
const PDF_TRAILER_SCAN_BYTES = 4096;
const PDF_EOF_MARKER = Buffer.from('%%EOF', 'ascii');

/** Chunk size for streaming UTF-8 validation (see assertText). */
const TEXT_DECODE_CHUNK_BYTES = 64 * 1024;

type ZipEntry = {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
};

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

  const tailStart = Math.max(0, payload.length - PDF_TRAILER_SCAN_BYTES);
  if (!payload.subarray(tailStart).includes(PDF_EOF_MARKER)) {
    throw new UnprocessableEntityException('INVALID_PDF_STRUCTURE');
  }
}

/**
 * Locate the End Of Central Directory record.
 *
 * Scans backwards over the maximum comment length and requires the record's
 * declared comment length to equal the number of bytes that actually follow it.
 * That equality is what distinguishes a real EOCD from four coincidental bytes —
 * the previous implementation accepted any file that merely *contained* the
 * signature anywhere, so arbitrary content with three byte patterns sprinkled in
 * passed as a valid archive.
 */
function findEocdOffset(payload: Buffer): number {
  const maxComment = Math.min(MAX_ZIP_COMMENT_SIZE, payload.length - EOCD_MIN_SIZE);

  for (let commentLength = 0; commentLength <= maxComment; commentLength += 1) {
    const offset = payload.length - EOCD_MIN_SIZE - commentLength;
    if (
      payload.readUInt32LE(offset) === EOCD_SIGNATURE &&
      payload.readUInt16LE(offset + 20) === commentLength
    ) {
      return offset;
    }
  }

  throw new UnprocessableEntityException('INVALID_ZIP_STRUCTURE');
}

/**
 * Parse the central directory into its entries.
 *
 * Only the central directory is read — a few hundred bytes — instead of the
 * previous approach, which converted the entire payload (up to MAX_UPLOAD_SIZE_MB)
 * into a latin1 JavaScript string and then ran substring searches over it.
 */
function parseZipEntries(payload: Buffer): ZipEntry[] {
  if (payload.length < EOCD_MIN_SIZE) {
    throw new UnprocessableEntityException('INVALID_ZIP_STRUCTURE');
  }

  const eocdOffset = findEocdOffset(payload);
  const entryCount = payload.readUInt16LE(eocdOffset + 10);
  const centralDirSize = payload.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = payload.readUInt32LE(eocdOffset + 16);
  const centralDirEnd = centralDirOffset + centralDirSize;

  // The central directory must lie wholly inside the file, ahead of the EOCD.
  if (centralDirEnd > eocdOffset || entryCount > MAX_ZIP_ENTRIES) {
    throw new UnprocessableEntityException('INVALID_ZIP_STRUCTURE');
  }

  // A non-empty archive begins with a local file header.
  if (entryCount > 0 && payload.readUInt32LE(0) !== LOCAL_HEADER_SIGNATURE) {
    throw new UnprocessableEntityException('INVALID_ZIP_STRUCTURE');
  }

  const entries: ZipEntry[] = [];
  let cursor = centralDirOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (
      cursor + CENTRAL_ENTRY_MIN_SIZE > centralDirEnd ||
      payload.readUInt32LE(cursor) !== CENTRAL_ENTRY_SIGNATURE
    ) {
      throw new UnprocessableEntityException('INVALID_ZIP_STRUCTURE');
    }

    const compressedSize = payload.readUInt32LE(cursor + 20);
    const uncompressedSize = payload.readUInt32LE(cursor + 24);
    const nameLength = payload.readUInt16LE(cursor + 28);
    const extraLength = payload.readUInt16LE(cursor + 30);
    const commentLength = payload.readUInt16LE(cursor + 32);
    const nameStart = cursor + CENTRAL_ENTRY_MIN_SIZE;
    const nameEnd = nameStart + nameLength;

    if (nameEnd > centralDirEnd) {
      throw new UnprocessableEntityException('INVALID_ZIP_STRUCTURE');
    }

    entries.push({
      name: payload.toString('utf8', nameStart, nameEnd),
      compressedSize,
      uncompressedSize,
    });

    cursor = nameEnd + extraLength + commentLength;
  }

  return entries;
}

/**
 * Reject entry names that would escape the extraction root. Nothing in this
 * service unpacks archives today, but the name travels with the stored object and
 * a consumer that does extract it must not be handed a traversal payload.
 */
function assertSafeEntryNames(entries: ZipEntry[]): void {
  for (const entry of entries) {
    const normalized = entry.name.replace(/\\/g, '/');
    const isAbsolute = normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized);
    const escapes = normalized.split('/').includes('..');

    if (isAbsolute || escapes) {
      throw new UnprocessableEntityException('UNSAFE_ZIP_ENTRY_NAME');
    }
  }
}

/**
 * Reject declared-decompression bombs: a small archive that expands to a size
 * capable of exhausting memory or disk in whatever consumes it downstream.
 */
function assertNotZipBomb(entries: ZipEntry[], payloadLength: number): void {
  let totalUncompressed = 0;
  for (const entry of entries) {
    totalUncompressed += entry.uncompressedSize;
  }

  if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) {
    throw new UnprocessableEntityException('ZIP_UNCOMPRESSED_TOO_LARGE');
  }

  if (payloadLength > 0 && totalUncompressed / payloadLength > MAX_ZIP_COMPRESSION_RATIO) {
    throw new UnprocessableEntityException('ZIP_COMPRESSION_RATIO_EXCEEDED');
  }
}

function assertZip(payload: Buffer): ZipEntry[] {
  const entries = parseZipEntries(payload);
  assertSafeEntryNames(entries);
  assertNotZipBomb(entries, payload.length);
  return entries;
}

/** OOXML containers must carry the content-type map plus at least one part under `prefix`. */
function assertOoxml(payload: Buffer, prefix: string, errorCode: string): void {
  const entries = assertZip(payload);
  const hasContentTypes = entries.some((entry) => entry.name === '[Content_Types].xml');
  const hasPart = entries.some((entry) => entry.name.startsWith(prefix));

  if (!hasContentTypes || !hasPart) {
    throw new UnprocessableEntityException(errorCode);
  }
}

function assertDocx(payload: Buffer): void {
  assertOoxml(payload, 'word/', 'INVALID_DOCX_STRUCTURE');
}

function assertPptx(payload: Buffer): void {
  assertOoxml(payload, 'ppt/', 'INVALID_PPTX_STRUCTURE');
}

function assertText(payload: Buffer): void {
  if (payload.includes(0)) {
    throw new UnprocessableEntityException('INVALID_TEXT_STRUCTURE');
  }

  // Validate UTF-8 in chunks. A single decode() of the whole payload allocated a
  // string as large as the upload; `stream: true` carries partial multi-byte
  // sequences across chunk boundaries, and the final flush rejects a truncated
  // trailing sequence. The decoder is per-call because streaming is stateful.
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for (let offset = 0; offset < payload.length; offset += TEXT_DECODE_CHUNK_BYTES) {
      const end = Math.min(offset + TEXT_DECODE_CHUNK_BYTES, payload.length);
      decoder.decode(payload.subarray(offset, end), { stream: true });
    }
    decoder.decode();
  } catch {
    throw new UnprocessableEntityException('INVALID_TEXT_STRUCTURE');
  }
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
