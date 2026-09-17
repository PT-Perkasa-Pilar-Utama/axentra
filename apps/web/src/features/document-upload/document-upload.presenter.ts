import { useState, useCallback } from "react";
import type { UploadDocumentResponse } from "@axentra/shared";
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
  SUCCESS: "File diterima untuk diproses",
  DUPLICATE: "File ini sudah ada",
  UNSUPPORTED: "Tipe file tidak didukung",
  GENERIC_ERROR: "Gagal mengunggah file",
} as const;

const SUPPORTED_EXTENSIONS = [".pdf", ".docx"];
const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export function isSupportedFile(file: { name: string; type?: string }): boolean {
  const lowerName = file.name.toLowerCase();
  const hasValidExt = SUPPORTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (!hasValidExt) return false;

  if (file.type && file.type.length > 0) {
    return SUPPORTED_MIME_TYPES.includes(file.type);
  }
  return true;
}

export function validateUploadFiles(files: { name: string; type?: string }[]): {
  valid: boolean;
  errorMessage?: string;
} {
  if (files.length === 0) {
    return { valid: false, errorMessage: "Tidak ada file yang dipilih" };
  }

  const hasUnsupported = files.some((f) => !isSupportedFile(f));
  if (hasUnsupported) {
    return { valid: false, errorMessage: UPLOAD_MESSAGES.UNSUPPORTED };
  }

  return { valid: true };
}

export type DocumentUploadPresenter = {
  status: UploadStatus;
  isUploading: boolean;
  notification: UploadNotification | null;
  uploadedDocuments: UploadDocumentResponse[];
  uploadFiles: (files: File[]) => Promise<void>;
  dismissNotification: () => void;
  reset: () => void;
};

export type DocumentUploadPresenterOptions = {
  uploadFn?: (files: File[]) => Promise<UploadDocumentResponse[]>;
  onSuccess?: (results: UploadDocumentResponse[]) => void;
};

export function useDocumentUploadPresenter(
  options?: DocumentUploadPresenterOptions,
): DocumentUploadPresenter {
  const uploadFn = options?.uploadFn ?? defaultUploadFn;
  const onSuccess = options?.onSuccess;

  const [status, setStatus] = useState<UploadStatus>("idle");
  const [notification, setNotification] = useState<UploadNotification | null>(null);
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadDocumentResponse[]>([]);

  const dismissNotification = useCallback((): void => {
    setNotification(null);
  }, []);

  const reset = useCallback((): void => {
    setStatus("idle");
    setNotification(null);
    setUploadedDocuments([]);
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
        const results = await uploadFn(files);
        setUploadedDocuments(results);
        setStatus("success");
        setNotification({
          type: "success",
          message: UPLOAD_MESSAGES.SUCCESS,
        });
        onSuccess?.(results);
      } catch (error) {
        if (
          error instanceof ApiClientError &&
          (error.code === "DUPLICATE_FILE" ||
            error.code === "CONFLICT" ||
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
    uploadedDocuments,
    uploadFiles,
    dismissNotification,
    reset,
  };
}
