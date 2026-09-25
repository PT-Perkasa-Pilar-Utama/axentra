import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RECENT_DOCUMENTS_QUERY_KEY } from "../recent-documents/recent-documents.presenter";
import type { DragEvent, MouseEvent } from "react";
import type { DocumentUploadAcceptedData } from "@axentra/shared";
import { uploadDocuments as defaultUploadFn } from "./document-upload.api";
import {
  isRecoverableStatus,
  validateUploadFiles,
  type UploadNotification,
  type UploadStatus,
} from "./document-upload.rules";
import {
  applyUploadPresenterEvent,
  deriveUploadPresenterProps,
  initialUploadPresenterState,
  type UploadPresenterState,
  type UploadPresenterEvent,
  type ExtendedUploadStatus,
} from "./document-upload.state";

export type { UploadStatus, UploadNotification } from "./document-upload.rules";
export {
  isSupportedFile,
  validateUploadFiles,
  classifyUploadError,
  isRecoverableStatus,
  UPLOAD_MESSAGES,
} from "./document-upload.rules";

export type DocumentUploadPresenter = {
  status: ExtendedUploadStatus;
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

  const [state, setState] = useState<UploadPresenterState>(initialUploadPresenterState);

  const dispatch = useCallback((event: UploadPresenterEvent) => {
    setState((prev) => applyUploadPresenterEvent(prev, event));
  }, []);

  const { isUploading, isProcessing, isBusy, isLocked, canRetry } =
    deriveUploadPresenterProps(state);

  const queryClient = useQueryClient();

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

        // Invalidate recent documents so the dashboard refreshes, and force
        // any currently-mounted/active query to refetch immediately.
        try {
          await queryClient.invalidateQueries({ queryKey: [...RECENT_DOCUMENTS_QUERY_KEY] });
          await queryClient.refetchQueries({
            queryKey: [...RECENT_DOCUMENTS_QUERY_KEY],
            exact: false,
            type: "active",
          });
        } catch {
          // best-effort — a failed refresh shouldn't fail the upload flow
        }
      } catch (error) {
        dispatch({ type: "UPLOAD_FAILED", error });
      }
    },
    [uploadFn, onSuccess, dispatch, queryClient],
  );

  const retry = useCallback(async (): Promise<void> => {
    if (!isRecoverableStatus(state.status as UploadStatus) || state.pendingFiles.length === 0)
      return;
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
