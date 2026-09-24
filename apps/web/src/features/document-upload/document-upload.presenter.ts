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

// ---------------------------------------------------------------------------
// State machine — pure, tidak bergantung React, dapat ditest langsung
// ---------------------------------------------------------------------------

export type UploadPresenterState = {
  status: UploadStatus;
  notification: UploadNotification | null;
  uploadedResult: DocumentUploadAcceptedData | null;
  pendingFiles: File[];
  isDragOver: boolean;
};

export type UploadPresenterEvent =
  | { type: "FILES_SELECTED"; files: File[] }
  | { type: "UPLOAD_SUCCEEDED"; result: DocumentUploadAcceptedData }
  | { type: "UPLOAD_FAILED"; error: unknown }
  | { type: "UPLOAD_ANOTHER" }
  | { type: "DISMISS_NOTIFICATION" }
  | { type: "DRAG_OVER" }
  | { type: "DRAG_LEAVE" };

export function initialUploadPresenterState(): UploadPresenterState {
  return {
    status: "idle",
    notification: null,
    uploadedResult: null,
    pendingFiles: [],
    isDragOver: false,
  };
}

export function applyUploadPresenterEvent(
  state: UploadPresenterState,
  event: UploadPresenterEvent,
): UploadPresenterState {
  switch (event.type) {
    case "FILES_SELECTED": {
      const validation = validateUploadFiles(event.files);
      if (!validation.valid) {
        return {
          ...state,
          status: "unsupported_error",
          pendingFiles: event.files,
          notification: {
            type: "error",
            message: validation.errorMessage ?? UPLOAD_MESSAGES.UNSUPPORTED,
          },
        };
      }
      return {
        ...state,
        status: "uploading",
        pendingFiles: event.files,
        notification: null,
        uploadedResult: null,
      };
    }

    case "UPLOAD_SUCCEEDED": {
      return {
        ...state,
        status: "processing",
        uploadedResult: event.result,
        // API hanya mengonfirmasi file diterima & diantre untuk worker, bukan
        // status pemrosesan final - jadi kita berhenti jujur di "processing"
        // dan TIDAK berpindah ke "success" tanpa sinyal status asli.
        notification: {
          type: "success",
          message: event.result.message ?? UPLOAD_MESSAGES.SUCCESS,
        },
      };
    }

    case "UPLOAD_FAILED": {
      const classified = classifyUploadError(event.error);
      return {
        ...state,
        status: classified.status,
        notification: { type: "error", message: classified.message },
      };
    }

    case "UPLOAD_ANOTHER": {
      return initialUploadPresenterState();
    }

    case "DISMISS_NOTIFICATION": {
      return { ...state, notification: null };
    }

    case "DRAG_OVER": {
      return { ...state, isDragOver: true };
    }

    case "DRAG_LEAVE": {
      return { ...state, isDragOver: false };
    }
  }
}

export function deriveUploadPresenterProps(state: UploadPresenterState): {
  isUploading: boolean;
  isProcessing: boolean;
  isBusy: boolean;
  isLocked: boolean;
  canRetry: boolean;
} {
  const isUploading = state.status === "uploading";
  const isProcessing = state.status === "processing";
  // Hanya "uploading" yang mengunci area. Saat "processing", file sudah
  // diterima dan area harus tetap terbuka agar tombol "Unggah Dokumen Lain"
  // tidak muncul di dalam container yang terlihat disabled (lihat F2).
  const isBusy = isUploading;
  const isLocked = isBusy;
  const canRetry = isRecoverableStatus(state.status) && state.pendingFiles.length > 0;
  return { isUploading, isProcessing, isBusy, isLocked, canRetry };
}

// ---------------------------------------------------------------------------
// Hook — thin wrapper di atas state machine, hanya mengurus React glue
// ---------------------------------------------------------------------------

export function useDocumentUploadPresenter(
  options?: DocumentUploadPresenterOptions,
): DocumentUploadPresenter {
  const uploadFn = options?.uploadFn ?? defaultUploadFn;
  const onSuccess = options?.onSuccess;

  const [state, setState] = useState<UploadPresenterState>(initialUploadPresenterState);

  const dispatch = useCallback((event: UploadPresenterEvent) => {
    setState((prev) => applyUploadPresenterEvent(prev, event));
  }, []);

  const { isUploading, isProcessing, isBusy, isLocked, canRetry } =
    deriveUploadPresenterProps(state);

  const dismissNotification = useCallback((): void => {
    dispatch({ type: "DISMISS_NOTIFICATION" });
  }, [dispatch]);

  const uploadAnother = useCallback((): void => {
    dispatch({ type: "UPLOAD_ANOTHER" });
  }, [dispatch]);

  const uploadFiles = useCallback(
    async (files: File[]): Promise<void> => {
      dispatch({ type: "FILES_SELECTED", files });

      const validation = validateUploadFiles(files);
      if (!validation.valid) return;

      try {
        const result = await uploadFn(files);
        dispatch({ type: "UPLOAD_SUCCEEDED", result });
        onSuccess?.(result);
      } catch (error) {
        dispatch({ type: "UPLOAD_FAILED", error });
      }
    },
    [uploadFn, onSuccess, dispatch],
  );

  const retry = useCallback(async (): Promise<void> => {
    if (!isRecoverableStatus(state.status) || state.pendingFiles.length === 0) return;
    await uploadFiles(state.pendingFiles);
  }, [state.status, state.pendingFiles, uploadFiles]);

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      if (!isLocked) dispatch({ type: "DRAG_OVER" });
    },
    [isLocked, dispatch],
  );

  const handleDragLeave = useCallback(
    (e: DragEvent<HTMLElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      dispatch({ type: "DRAG_LEAVE" });
    },
    [dispatch],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      dispatch({ type: "DRAG_LEAVE" });
      if (isLocked) return;

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        void uploadFiles(droppedFiles);
      }
    },
    [isLocked, uploadFiles, dispatch],
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
    status: state.status,
    isUploading,
    isProcessing,
    isBusy,
    notification: state.notification,
    uploadedResult: state.uploadedResult,
    pendingFiles: state.pendingFiles,
    canRetry,
    dismissNotification,
    uploadAnother,
    isDragOver: state.isDragOver,
    isLocked,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFilesSelected,
    handleRetryClick,
  };
}
