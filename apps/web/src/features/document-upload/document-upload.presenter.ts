import { useCallback, useState } from "react";
import type { DragEvent, MouseEvent } from "react";
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

export type DocumentUploadPresenter = {
  status: UploadStatus;
  isUploading: boolean;
  isProcessing: boolean;
  isBusy: boolean;
  notification: UploadNotification | null;
  uploadedResult: DocumentUploadAcceptedData | null;
  pendingFiles: File[];
  canRetry: boolean;
  dismissNotification: () => void;
  uploadAnother: () => void;
  isDragOver: boolean;
  isLocked: boolean;
  handleDragOver: (e: DragEvent<HTMLElement>) => void;
  handleDragLeave: (e: DragEvent<HTMLElement>) => void;
  handleDrop: (e: DragEvent<HTMLElement>) => void;
  /** Terima file yang sudah diekstrak (dari input change atau drop). Reset nilai input adalah tanggung jawab view. */
  handleFilesSelected: (files: FileList | File[] | null) => void;
  handleRetryClick: (e: MouseEvent<HTMLElement>) => void;
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
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const isProcessing = status === "processing";
  const isUploading = status === "uploading";
  // Hanya "uploading" yang mengunci area. Saat "processing", file sudah
  // diterima dan area harus tetap terbuka agar tombol "Unggah Dokumen Lain"
  // tidak muncul di dalam container yang terlihat disabled (lihat F2).
  const isBusy = isUploading;
  const isLocked = isBusy;
  const canRetry = isRecoverableStatus(status) && pendingFiles.length > 0;

  const dismissNotification = useCallback((): void => {
    setNotification(null);
  }, []);

  const uploadAnother = useCallback((): void => {
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
        setUploadedResult(result);
        // API hanya mengonfirmasi file diterima & diantre untuk worker, bukan
        // status pemrosesan final - jadi kita berhenti jujur di "processing"
        // dan TIDAK berpindah ke "success" tanpa sinyal status asli.
        setStatus("processing");
        setNotification({
          type: "success",
          message: result.message ?? UPLOAD_MESSAGES.SUCCESS,
        });
        onSuccess?.(result);
      } catch (error) {
        const classified = classifyUploadError(error);
        setStatus(classified.status);
        setNotification({ type: "error", message: classified.message });
      }
    },
    [uploadFn, onSuccess],
  );

  const retry = useCallback(async (): Promise<void> => {
    if (!isRecoverableStatus(status) || pendingFiles.length === 0) return;
    await uploadFiles(pendingFiles);
  }, [status, pendingFiles, uploadFiles]);

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      if (!isLocked) setIsDragOver(true);
    },
    [isLocked],
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (isLocked) return;

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        void uploadFiles(droppedFiles);
      }
    },
    [isLocked, uploadFiles],
  );

  const handleFilesSelected = useCallback(
    (files: FileList | File[] | null): void => {
      const selectedFiles = files ? Array.from(files) : [];
      if (selectedFiles.length > 0) {
        void uploadFiles(selectedFiles);
      }
    },
    [uploadFiles],
  );

  const handleRetryClick = useCallback(
    (e: MouseEvent<HTMLElement>): void => {
      e.stopPropagation();
      if (isLocked) return;
      void retry();
    },
    [isLocked, retry],
  );

  return {
    status,
    isUploading,
    isProcessing,
    isBusy,
    notification,
    uploadedResult,
    pendingFiles,
    canRetry,
    dismissNotification,
    uploadAnother,
    isDragOver,
    isLocked,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFilesSelected,
    handleRetryClick,
  };
}
