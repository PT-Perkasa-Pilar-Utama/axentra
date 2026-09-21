import { useState, useCallback, useRef, useEffect } from "react";
import type { DocumentUploadAcceptedData } from "@axentra/shared";
import { uploadDocuments as defaultUploadFn } from "./document-upload.api";
import {
  classifyUploadError,
  isRecoverableStatus,
  UPLOAD_MESSAGES,
  validateUploadFiles,
  type UploadNotification,
  type UploadStatus,
} from "./document-upload.rules";

export type { UploadStatus, UploadNotification } from "./document-upload.rules";
export {
  isSupportedFile,
  validateUploadFiles,
  classifyUploadError,
  isRecoverableStatus,
  UPLOAD_MESSAGES,
} from "./document-upload.rules";

export const PROCESSING_FEEDBACK_MS = 900;

function defaultProcessingFn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, PROCESSING_FEEDBACK_MS));
}

export type DocumentUploadPresenter = {
  status: UploadStatus;
  isUploading: boolean;
  isProcessing: boolean;
  isBusy: boolean;
  notification: UploadNotification | null;
  uploadedResult: DocumentUploadAcceptedData | null;
  pendingFiles: File[];
  canRetry: boolean;
  uploadFiles: (files: File[]) => Promise<void>;
  retry: () => Promise<void>;
  dismissNotification: () => void;
  reset: () => void;
};

export type DocumentUploadPresenterOptions = {
  uploadFn?: (files: File[]) => Promise<DocumentUploadAcceptedData>;
  processingFn?: (result: DocumentUploadAcceptedData) => Promise<void>;
  onSuccess?: (result: DocumentUploadAcceptedData) => void;
};

export function useDocumentUploadPresenter(
  options?: DocumentUploadPresenterOptions,
): DocumentUploadPresenter {
  const uploadFn = options?.uploadFn ?? defaultUploadFn;
  const processingFn = options?.processingFn ?? defaultProcessingFn;
  const onSuccess = options?.onSuccess;

  const [status, setStatus] = useState<UploadStatus>("idle");
  const [notification, setNotification] = useState<UploadNotification | null>(null);
  const [uploadedResult, setUploadedResult] = useState<DocumentUploadAcceptedData | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const dismissNotification = useCallback((): void => {
    setNotification(null);
  }, []);

  const reset = useCallback((): void => {
    setStatus("idle");
    setNotification(null);
    setUploadedResult(null);
    setPendingFiles([]);
  }, []);

  const uploadFiles = useCallback(
    async (files: File[]): Promise<void> => {
      setPendingFiles(files);

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
      setUploadedResult(null);

      try {
        const result = await uploadFn(files);
        if (!isMountedRef.current) return;

        setUploadedResult(result);
        setStatus("processing");
        setNotification({
          type: "success",
          message: result.message ?? UPLOAD_MESSAGES.SUCCESS,
        });

        await processingFn(result);
        if (!isMountedRef.current) return;

        setStatus("success");
        setPendingFiles([]);
        onSuccess?.(result);
      } catch (error) {
        if (!isMountedRef.current) return;

        const classified = classifyUploadError(error);
        setStatus(classified.status);
        setNotification({ type: "error", message: classified.message });
      }
    },
    [uploadFn, processingFn, onSuccess],
  );

  const canRetry = isRecoverableStatus(status) && pendingFiles.length > 0;

  const retry = useCallback(async (): Promise<void> => {
    if (!isRecoverableStatus(status) || pendingFiles.length === 0) return;
    await uploadFiles(pendingFiles);
  }, [status, pendingFiles, uploadFiles]);

  return {
    status,
    isUploading: status === "uploading",
    isProcessing: status === "processing",
    isBusy: status === "uploading" || status === "processing",
    notification,
    uploadedResult,
    pendingFiles,
    canRetry,
    uploadFiles,
    retry,
    dismissNotification,
    reset,
  };
}
