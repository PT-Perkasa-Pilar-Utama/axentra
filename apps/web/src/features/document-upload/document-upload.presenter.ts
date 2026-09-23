import { useState, useCallback, useRef, useEffect } from "react";
import type {
  RefObject,
  DragEvent as ReactDragEvent,
  ChangeEvent as ReactChangeEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
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

function defaultProcessingFn(): Promise<void> {
  return new Promise(() => {});
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
  uploadAnother: () => void;
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
    isBusy: status === "uploading",
    notification,
    uploadedResult,
    pendingFiles,
    canRetry,
    uploadFiles,
    retry,
    dismissNotification,
    reset,
    uploadAnother: reset,
  };
}

export function useDocumentUploadInteraction(
  presenter: DocumentUploadPresenter,
  disabled: boolean = false,
): {
  isDragOver: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  isLocked: boolean;
  handleDragOver: (e: ReactDragEvent<HTMLElement>) => void;
  handleDragLeave: (e: ReactDragEvent<HTMLElement>) => void;
  handleDrop: (e: ReactDragEvent<HTMLElement>) => void;
  handleFileInputChange: (e: ReactChangeEvent<HTMLInputElement>) => void;
  handleBrowseClick: () => void;
  handleRetryClick: (e: ReactMouseEvent<HTMLElement>) => Promise<void>;
} {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLocked = disabled || presenter.isBusy;

  const handleDragOver = useCallback(
    (e: ReactDragEvent<HTMLElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      if (!isLocked) setIsDragOver(true);
    },
    [isLocked],
  );

  const handleDragLeave = useCallback((e: ReactDragEvent<HTMLElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: ReactDragEvent<HTMLElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (isLocked) return;

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        void presenter.uploadFiles(droppedFiles);
      }
    },
    [isLocked, presenter],
  );

  const handleFileInputChange = useCallback(
    (e: ReactChangeEvent<HTMLInputElement>): void => {
      const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
      if (selectedFiles.length > 0) {
        void presenter.uploadFiles(selectedFiles);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [presenter],
  );

  const handleBrowseClick = useCallback((): void => {
    if (!isLocked && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [isLocked]);

  const handleRetryClick = useCallback(
    async (e: ReactMouseEvent<HTMLElement>): Promise<void> => {
      e.stopPropagation();
      if (isLocked) return;
      await presenter.retry();
    },
    [isLocked, presenter],
  );

  return {
    isDragOver,
    fileInputRef,
    isLocked,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileInputChange,
    handleBrowseClick,
    handleRetryClick,
  };
}
