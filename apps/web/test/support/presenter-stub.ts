import type {
  DocumentUploadPresenter,
  UploadStatus,
} from "../../src/features/document-upload/document-upload.presenter";

export function stubPresenter(
  overrides: Partial<DocumentUploadPresenter> & { status: UploadStatus },
): DocumentUploadPresenter {
  const status = overrides.status;

  const defaults: DocumentUploadPresenter = {
    status,
    isUploading: status === "uploading",
    isProcessing: status === "processing",
    isBusy: status === "uploading" || status === "processing",
    notification: null,
    uploadedResult: null,
    pendingFiles: [],
    canRetry: false,
    uploadFiles: async () => {},
    retry: async () => {},
    dismissNotification: () => {},
    reset: () => {},
    uploadAnother: () => {},
  };

  return { ...defaults, ...overrides };
}
