import type { DocumentUploadAcceptedData } from "@axentra/shared";
import {
  classifyUploadError,
  isRecoverableStatus,
  UPLOAD_MESSAGES,
  validateUploadFiles,
  type UploadNotification,
  type UploadStatus,
} from "./document-upload.rules";

export type ExtendedUploadStatus = UploadStatus | "validation_error";

export type UploadPresenterState = {
  status: ExtendedUploadStatus;
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

/**
 * Satu notifikasi sukses per unggahan (AC-01.04). Untuk banyak file, nama setiap file yang
 * diterima ditulis di belakang kalimat BA dalam satu baris, dipisah koma:
 * "File diterima untuk diproses: a.docx, b.docx, c.docx".
 */
function buildSuccessNotification(result: DocumentUploadAcceptedData): UploadNotification {
  if (result.files.length > 1) {
    const fileNames = result.files.map((file) => file.filename).join(", ");
    return { type: "success", message: `${result.message}: ${fileNames}` };
  }
  return { type: "success", message: result.message };
}

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
        const isUnsupported = validation.errorMessage === UPLOAD_MESSAGES.UNSUPPORTED;
        return {
          ...state,
          status: isUnsupported ? "unsupported_error" : "validation_error",
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
        notification: buildSuccessNotification(event.result),
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
  const isBusy = isUploading;
  const isLocked = isBusy;
  const canRetry =
    isRecoverableStatus(state.status as UploadStatus) && state.pendingFiles.length > 0;
  return { isUploading, isProcessing, isBusy, isLocked, canRetry };
}
