import type {
  DocumentType,
  DocumentUploadAcceptedData,
  DocumentUploadFileMeta,
  SupportedDocumentExtension,
  SupportedDocumentMimeType,
} from "@axentra/shared";
import {
  DOCUMENT_COPY,
  DOCUMENT_ERROR_CODES,
  DOCUMENT_MIME_ALLOWLIST_BY_TYPE,
  DOCUMENT_TYPES,
  MAX_AGGREGATE_UPLOAD_SIZE_BYTES,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  MAX_DOCX_BATCH_COUNT,
  SUPPORTED_DOCUMENT_EXTENSIONS,
  SUPPORTED_DOCUMENT_MIME_TYPES,
  documentUploadAcceptedDataSchema,
  documentUploadFileMetaSchema,
  getDocumentExtension,
  getDocumentTypeFromFilename,
  isSupportedDocumentExtension,
} from "@axentra/shared";
import { PayloadTooLargeError, UnsupportedFileTypeError, ValidationError } from "../../http/errors";

export type RawUploadFile = {
  filename: string;
  size: number;
  mimeType: string;
  bytes: Uint8Array;
};

export type UploadedFileItem = {
  filename: string;
  size: number;
  mimeType: string;
  bytes: Uint8Array;
};

export type ValidatedDocumentFile = {
  filename: string;
  size: number;
  mimeType: string;
  documentType: DocumentType;
};

export function isPdfBuffer(header: Uint8Array): boolean {
  if (header.byteLength < 5) return false;
  // %PDF- signature: 0x25, 0x50, 0x44, 0x46, 0x2D
  return (
    header[0] === 0x25 &&
    header[1] === 0x50 &&
    header[2] === 0x44 &&
    header[3] === 0x46 &&
    header[4] === 0x2d
  );
}

/**
 * Parses ZIP Central Directory headers without decompression to extract entry names.
 * Safe against zip bombs and memory exhaustion as it only reads entry headers.
 */
export function parseZipEntryNames(bytes: Uint8Array): Set<string> {
  const entries = new Set<string>();
  const len = bytes.length;
  if (len < 22) return entries;

  // Search for End of Central Directory (EOCD): signature 0x06054b50 (PK\x05\x06)
  let eocdOffset = -1;
  const minOffset = Math.max(0, len - 65557);
  for (let i = len - 22; i >= minOffset; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) return entries;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  if (cdOffset + cdSize > len) return entries;

  let current = cdOffset;
  const decoder = new TextDecoder("utf-8");

  while (current + 46 <= cdOffset + cdSize) {
    const sig = view.getUint32(current, true);
    if (sig !== 0x02014b50) break; // PK\x01\x02

    const filenameLen = view.getUint16(current + 28, true);
    const extraLen = view.getUint16(current + 30, true);
    const commentLen = view.getUint16(current + 32, true);

    const nameStart = current + 46;
    if (nameStart + filenameLen > len) break;

    const filename = decoder.decode(bytes.subarray(nameStart, nameStart + filenameLen));
    entries.add(filename);

    current = nameStart + filenameLen + extraLen + commentLen;
  }

  return entries;
}

/**
 * Validates Office Open XML (.docx) by verifying ZIP structure and required entries.
 */
export function isDocxBuffer(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 30) return false;
  // Must begin with ZIP local header signature PK\x03\x04
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    return false;
  }

  // Parse ZIP central directory to verify all mandatory OOXML parts exist
  const entries = parseZipEntryNames(bytes);
  return (
    entries.has("[Content_Types].xml") &&
    entries.has("_rels/.rels") &&
    entries.has("word/document.xml")
  );
}

export function validateSingleFileConstraints(file: RawUploadFile): ValidatedDocumentFile {
  if (file.size === 0) {
    throw new ValidationError(DOCUMENT_COPY.EMPTY_FILE);
  }

  const filename = typeof file.filename === "string" ? file.filename.trim() : "";
  if (filename.length === 0) {
    throw new ValidationError("Nama file tidak valid");
  }

  if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    throw new PayloadTooLargeError(DOCUMENT_COPY.FILE_TOO_LARGE);
  }

  const extension = getDocumentExtension(filename);
  if (!isSupportedDocumentExtension(extension)) {
    throw new UnsupportedFileTypeError(DOCUMENT_COPY.UNSUPPORTED_TYPE);
  }

  const documentType = getDocumentTypeFromFilename(filename);
  if (documentType === null) {
    throw new UnsupportedFileTypeError(DOCUMENT_COPY.UNSUPPORTED_TYPE);
  }

  const allowedMimes = DOCUMENT_MIME_ALLOWLIST_BY_TYPE[documentType];
  const normalizedMime = file.mimeType.trim().toLowerCase();
  if (!allowedMimes.includes(normalizedMime)) {
    throw new UnsupportedFileTypeError(DOCUMENT_COPY.UNSUPPORTED_TYPE);
  }

  if (documentType === "pdf" && !isPdfBuffer(file.bytes)) {
    throw new UnsupportedFileTypeError(DOCUMENT_COPY.UNSUPPORTED_TYPE);
  }

  if (documentType === "docx" && !isDocxBuffer(file.bytes)) {
    throw new UnsupportedFileTypeError(DOCUMENT_COPY.UNSUPPORTED_TYPE);
  }

  return {
    filename,
    size: file.size,
    mimeType: file.mimeType,
    documentType,
  };
}

export function validateUploadBatchConstraints(
  files: ReadonlyArray<RawUploadFile>,
): ReadonlyArray<ValidatedDocumentFile> {
  if (files.length === 0) {
    throw new ValidationError(DOCUMENT_COPY.NO_FILES);
  }

  if (files.length > MAX_DOCX_BATCH_COUNT) {
    throw new ValidationError(DOCUMENT_COPY.EXCEEDS_DOCX_BATCH_LIMIT);
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > MAX_AGGREGATE_UPLOAD_SIZE_BYTES) {
    throw new PayloadTooLargeError(DOCUMENT_COPY.FILE_TOO_LARGE);
  }

  const validatedFiles = files.map(validateSingleFileConstraints);

  const hasPdf = validatedFiles.some((f) => f.documentType === "pdf");
  const hasDocx = validatedFiles.some((f) => f.documentType === "docx");

  if (hasPdf && hasDocx) {
    throw new ValidationError(DOCUMENT_COPY.MIXED_TYPES_NOT_ALLOWED);
  }

  if (hasPdf && validatedFiles.length > 1) {
    throw new ValidationError(DOCUMENT_COPY.SINGLE_PDF_ONLY);
  }

  return validatedFiles;
}

export {
  DOCUMENT_COPY,
  DOCUMENT_ERROR_CODES,
  DOCUMENT_TYPES,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  MAX_DOCX_BATCH_COUNT,
  MAX_AGGREGATE_UPLOAD_SIZE_BYTES,
  SUPPORTED_DOCUMENT_EXTENSIONS,
  SUPPORTED_DOCUMENT_MIME_TYPES,
  documentUploadAcceptedDataSchema,
  documentUploadFileMetaSchema,
};

export type {
  DocumentType,
  DocumentUploadAcceptedData,
  DocumentUploadFileMeta,
  SupportedDocumentExtension,
  SupportedDocumentMimeType,
};
