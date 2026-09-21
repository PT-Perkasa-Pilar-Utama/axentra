import {
  DOCUMENT_COPY,
  DOCUMENT_ERROR_CODES,
  MAX_DOCX_BATCH_COUNT,
  getDocumentExtension,
  getDocumentTypeFromFilename,
  isSupportedDocumentExtension,
  isSupportedDocumentMimeType,
} from "@axentra/shared";
import { ApiClientError } from "../../lib/api-client";

export type UploadStatus =
  | "idle"
  | "uploading"
  | "processing"
  | "success"
  | "duplicate_error"
  | "unsupported_error"
  | "error";

export type UploadNotification = {
  type: "success" | "error";
  message: string;
};

export const UPLOAD_MESSAGES = {
  SUCCESS: DOCUMENT_COPY.UPLOAD_ACCEPTED,
  PROCESSING: "Dokumen sedang diproses",
  DUPLICATE: DOCUMENT_COPY.DUPLICATE_WARNING,
  UNSUPPORTED: DOCUMENT_COPY.UNSUPPORTED_TYPE,
  SINGLE_PDF_ONLY: DOCUMENT_COPY.SINGLE_PDF_ONLY,
  MIXED_TYPES: DOCUMENT_COPY.MIXED_TYPES_NOT_ALLOWED,
  EXCEEDS_BATCH_LIMIT: DOCUMENT_COPY.EXCEEDS_DOCX_BATCH_LIMIT,
  EMPTY_FILES: "Tidak ada file yang dipilih",
  GENERIC_ERROR: "Gagal mengunggah file",
} as const;

export function isSupportedFile(file: { name: string; type?: string }): boolean {
  const ext = getDocumentExtension(file.name);
  if (!isSupportedDocumentExtension(ext)) {
    return false;
  }

  if (file.type && file.type.length > 0) {
    return isSupportedDocumentMimeType(file.type);
  }

  return true;
}

export function validateUploadFiles(files: { name: string; type?: string }[]): {
  valid: boolean;
  errorMessage?: string;
} {
  if (files.length === 0) {
    return { valid: false, errorMessage: UPLOAD_MESSAGES.EMPTY_FILES };
  }

  const hasUnsupported = files.some((f) => !isSupportedFile(f));
  if (hasUnsupported) {
    return { valid: false, errorMessage: UPLOAD_MESSAGES.UNSUPPORTED };
  }

  const hasPdf = files.some((f) => getDocumentTypeFromFilename(f.name) === "pdf");
  const hasDocx = files.some((f) => getDocumentTypeFromFilename(f.name) === "docx");

  if (hasPdf && hasDocx) {
    return { valid: false, errorMessage: UPLOAD_MESSAGES.MIXED_TYPES };
  }

  if (hasPdf && files.length > 1) {
    return { valid: false, errorMessage: UPLOAD_MESSAGES.SINGLE_PDF_ONLY };
  }

  if (hasDocx && files.length > MAX_DOCX_BATCH_COUNT) {
    return { valid: false, errorMessage: UPLOAD_MESSAGES.EXCEEDS_BATCH_LIMIT };
  }

  return { valid: true };
}

export function isRecoverableStatus(status: UploadStatus): boolean {
  return status === "error";
}

export function classifyUploadError(error: unknown): {
  status: Extract<UploadStatus, "duplicate_error" | "unsupported_error" | "error">;
  message: string;
} {
  if (error instanceof ApiClientError) {
    const normalized = error.message.toLowerCase();
    const isDuplicate =
      error.code === DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT ||
      error.code === "DUPLICATE_FILE" ||
      error.code === "CONFLICT" ||
      error.status === 409 ||
      normalized.includes("sudah ada") ||
      normalized.includes("already exists");

    if (isDuplicate) {
      return { status: "duplicate_error", message: UPLOAD_MESSAGES.DUPLICATE };
    }

    if (error.code === DOCUMENT_ERROR_CODES.UNSUPPORTED_FILE_TYPE || error.status === 415) {
      return {
        status: "unsupported_error",
        message: error.message || UPLOAD_MESSAGES.UNSUPPORTED,
      };
    }
  }

  const message =
    error instanceof Error && error.message ? error.message : UPLOAD_MESSAGES.GENERIC_ERROR;

  return { status: "error", message };
}
