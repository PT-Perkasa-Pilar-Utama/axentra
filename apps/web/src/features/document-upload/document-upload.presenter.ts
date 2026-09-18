import { useState, useCallback } from "react";
import type { DocumentUploadAcceptedData } from "@axentra/shared";
import {
  DOCUMENT_COPY,
  DOCUMENT_ERROR_CODES,
  MAX_DOCX_BATCH_COUNT,
  getDocumentExtension,
  getDocumentTypeFromFilename,
  isSupportedDocumentExtension,
  isSupportedDocumentMimeType,
} from "@axentra/shared";
import { uploadDocuments as defaultUploadFn } from "./document-upload.api";
import { ApiClientError } from "../../lib/api-client";

export type UploadStatus =
  | "idle"
  | "uploading"
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

export type DocumentUploadPresenter = {
  status: UploadStatus;
  isUploading: boolean;
  notification: UploadNotification | null;
  uploadedResult: DocumentUploadAcceptedData | null;
  uploadFiles: (files: File[]) => Promise<void>;
  dismissNotification: () => void;
  reset: () => void;
};

export type DocumentUploadPresenterOptions = {
  uploadFn?: (files: File[]) => Promise<DocumentUploadAcceptedData>;
  onSuccess?: (result: DocumentUploadAcceptedData) => void;
};

export function useDocumentUploadPresenter(
  options?: DocumentUploadPresenterOptions,
): DocumentUploadPresenter {
  const uploadFn = options?.uploadFn ?? defaultUploadFn;
  const onSuccess = options?.onSuccess;

  const [status, setStatus] = useState<UploadStatus>("idle");
  const [notification, setNotification] = useState<UploadNotification | null>(null);
  const [uploadedResult, setUploadedResult] = useState<DocumentUploadAcceptedData | null>(null);

  const dismissNotification = useCallback((): void => {
    setNotification(null);
  }, []);

  const reset = useCallback((): void => {
    setStatus("idle");
    setNotification(null);
    setUploadedResult(null);
  }, []);

  const uploadFiles = useCallback(
    async (files: File[]): Promise<void> => {
      const validation = validateUploadFiles(files);
      if (!validation.valid) {
        setStatus("unsupported_error");
        setNotification({
          type: "error",
          message: validation.errorMessage ?? UPLOAD_MESSAGES.UNSUPPORTED,
        });
        return;
      }

      setStatus("uploading");
      setNotification(null);

      try {
        const result = await uploadFn(files);
        setUploadedResult(result);
        setStatus("success");
        setNotification({
          type: "success",
          message: result.message ?? UPLOAD_MESSAGES.SUCCESS,
        });
        onSuccess?.(result);
      } catch (error) {
        if (
          error instanceof ApiClientError &&
          (error.code === DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT ||
            error.code === "DUPLICATE_FILE" ||
            error.code === "CONFLICT" ||
            error.status === 409 ||
            error.message.toLowerCase().includes("sudah ada") ||
            error.message.toLowerCase().includes("already exists"))
        ) {
          setStatus("duplicate_error");
          setNotification({
            type: "error",
            message: UPLOAD_MESSAGES.DUPLICATE,
          });
          return;
        }

        if (
          error instanceof ApiClientError &&
          (error.code === DOCUMENT_ERROR_CODES.UNSUPPORTED_FILE_TYPE || error.status === 415)
        ) {
          setStatus("unsupported_error");
          setNotification({
            type: "error",
            message: error.message || UPLOAD_MESSAGES.UNSUPPORTED,
          });
          return;
        }

        const message =
          error instanceof Error && error.message ? error.message : UPLOAD_MESSAGES.GENERIC_ERROR;

        setStatus("error");
        setNotification({
          type: "error",
          message,
        });
      }
    },
    [uploadFn, onSuccess],
  );

  return {
    status,
    isUploading: status === "uploading",
    notification,
    uploadedResult,
    uploadFiles,
    dismissNotification,
    reset,
  };
}
