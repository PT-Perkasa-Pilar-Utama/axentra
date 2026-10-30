import type { ChangeEvent, DragEvent, MouseEvent, RefObject } from "react";
import type { DocumentUploadPresenter } from "./document-upload.presenter";
import type { UploadNotification } from "./document-upload.rules";

export type UploadAreaStage = "uploading" | "processing" | "retry" | "empty";
export type UploadNotificationTone = "success" | "error";

export type UploadNotificationView = {
  message: string;
  tone: UploadNotificationTone;
};

export type DocumentUploadAreaPresenter = {
  /** isLocked dari presenter atau prop disabled dari parent, mana pun yang aktif. */
  isLocked: boolean;
  stage: UploadAreaStage;
  notification: UploadNotificationView | null;
  retainedFileNames: string;
  handleDragOver: (e: DragEvent<HTMLElement>) => void;
  handleDrop: (e: DragEvent<HTMLElement>) => void;
  handleBrowseClick: (e?: MouseEvent<HTMLElement>) => void;
  handleFileInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleRetryClick: (e: MouseEvent<HTMLElement>) => void;
};

export type DocumentUploadAreaPresenterOptions = {
  presenter: DocumentUploadPresenter;
  disabled: boolean;
  /** Ref input berkas milik view; presenter hanya mengaksesnya di dalam handler klik. */
  fileInputRef: RefObject<HTMLInputElement | null>;
};

// Urutan prioritas sama dengan rantai if sebelumnya: sedang unggah, lalu diproses, lalu gagal.
export function deriveUploadStage(
  presenter: Pick<DocumentUploadPresenter, "isUploading" | "isProcessing" | "canRetry">,
): UploadAreaStage {
  if (presenter.isUploading) return "uploading";
  if (presenter.isProcessing) return "processing";
  if (presenter.canRetry) return "retry";
  return "empty";
}

export function deriveNotificationView(
  notification: UploadNotification | null,
): UploadNotificationView | null {
  if (!notification) return null;
  return {
    message: notification.message,
    tone: notification.type === "success" ? "success" : "error",
  };
}

/**
 * Presenter area unggah. Prop disabled dari luar (mis. parent form belum valid) tetap dipisah dari
 * isBusy presenter, sehingga satu presenter dapat dipakai beberapa area dengan keadaan nonaktif
 * yang berbeda (lihat F4). Ref input berkas dipegang view dan hanya dibaca di handler, bukan saat
 * render.
 */
export function useDocumentUploadAreaPresenter({
  presenter,
  disabled,
  fileInputRef,
}: DocumentUploadAreaPresenterOptions): DocumentUploadAreaPresenter {
  const isLocked = presenter.isLocked || disabled;

  const handleDragOver = (e: DragEvent<HTMLElement>): void => {
    if (disabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    presenter.handleDragOver(e);
  };

  const handleDrop = (e: DragEvent<HTMLElement>): void => {
    if (disabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    presenter.handleDrop(e);
  };

  const handleBrowseClick = (e?: MouseEvent<HTMLElement>): void => {
    e?.stopPropagation();
    if (isLocked) return;
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    presenter.handleFilesSelected(e.target.files);
    e.target.value = "";
  };

  const handleRetryClick = (e: MouseEvent<HTMLElement>): void => {
    e.stopPropagation();
    if (disabled) return;
    presenter.handleRetryClick(e);
  };

  return {
    isLocked,
    stage: deriveUploadStage(presenter),
    notification: deriveNotificationView(presenter.notification),
    retainedFileNames: presenter.pendingFiles.map((file) => file.name).join(", "),
    handleDragOver,
    handleDrop,
    handleBrowseClick,
    handleFileInputChange,
    handleRetryClick,
  };
}
