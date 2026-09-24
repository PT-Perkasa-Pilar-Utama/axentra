import { useRef } from "react";
import type React from "react";
import type { ChangeEvent, MouseEvent } from "react";
import {
  useDocumentUploadPresenter,
  type DocumentUploadPresenter,
} from "./document-upload.presenter";
import {
  UploadEmptyPromptState,
  UploadLoadingState,
  UploadProcessingState,
  UploadRetryState,
} from "./document-upload-dropzone-states.view";

const fileOutlinePaths = [
  "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
  "M14 2v4a2 2 0 0 0 2 2h4",
];
const toastIconPaths = {
  success: [...fileOutlinePaths, "m9 15 2 2 4-4"],
  error: [...fileOutlinePaths, "m14.5 12.5-5 5", "m9.5 12.5 5 5"],
} as const;
import { UserSessionBadge } from "../auth/user-session-badge.view";

export type DocumentUploadNotificationViewProps = {
  presenter: DocumentUploadPresenter;
};

export function DocumentUploadNotificationView({
  presenter,
}: DocumentUploadNotificationViewProps): React.JSX.Element | null {
  const { notification, dismissNotification } = presenter;
  if (!notification) return null;

  const isSuccess = notification.type === "success";
  const iconPaths = isSuccess ? toastIconPaths.success : toastIconPaths.error;
  const statusLabel = isSuccess ? "Unggah berhasil." : "Unggah gagal.";

  return (
    <div
      data-testid="upload-notification"
      className={`upload-notification fixed left-1/2 top-20 z-50 flex w-full max-w-md -translate-x-1/2 items-center gap-4 px-6 py-4 rounded-xl text-sm text-gray-900 shadow-md transition-all ${
        isSuccess ? "bg-[#c9f0dc]" : "bg-[#f0a7a7]"
      }`}
      role="alert"
      aria-live="polite"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {iconPaths.map((path) => (
          <path key={path} d={path} />
        ))}
      </svg>
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{statusLabel}</span>{" "}
        <span data-testid="notification-message">{notification.message}</span>
      </p>
      <button
        type="button"
        onClick={dismissNotification}
        className="shrink-0 p-1 text-gray-900 hover:opacity-70 focus:outline-none cursor-pointer"
        aria-label="Tutup notifikasi"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  );
}

export type DocumentUploadAreaViewProps = {
  presenter: DocumentUploadPresenter;
  /**
   * Menonaktifkan area dari luar (mis. saat parent form belum valid). Terpisah
   * dari state internal presenter (isBusy), sehingga satu presenter dapat
   * dipakai oleh beberapa view dengan disabled state berbeda-beda (lihat F4).
   */
  disabled?: boolean;
};

export function DocumentUploadAreaView({
  presenter,
  disabled = false,
}: DocumentUploadAreaViewProps): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLocked = presenter.isLocked || disabled;

  const handleDragOver: DocumentUploadPresenter["handleDragOver"] = (e) => {
    if (disabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    presenter.handleDragOver(e);
  };

  const handleDrop: DocumentUploadPresenter["handleDrop"] = (e) => {
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

  const handleRetryClick: DocumentUploadPresenter["handleRetryClick"] = (e) => {
    e.stopPropagation();
    if (disabled) return;
    presenter.handleRetryClick(e);
  };

  let body: React.JSX.Element;
  if (presenter.isUploading) {
    body = <UploadLoadingState />;
  } else if (presenter.isProcessing) {
    body = <UploadProcessingState onUploadAnother={presenter.uploadAnother} />;
  } else if (presenter.canRetry) {
    body = (
      <UploadRetryState
        pendingFiles={presenter.pendingFiles}
        disabled={isLocked}
        onRetry={handleRetryClick}
        onChooseOther={handleBrowseClick}
      />
    );
  } else {
    body = <UploadEmptyPromptState disabled={isLocked} onBrowse={handleBrowseClick} />;
  }

  return (
    <div className="rounded-2xl bg-white p-3 space-y-3" data-testid="document-upload-container">
      <DocumentUploadNotificationView presenter={presenter} />

      <div
        data-testid="upload-dropzone"
        role="region"
        aria-label="Area Unggah Dokumen"
        aria-busy={presenter.isBusy}
        onDragOver={handleDragOver}
        onDragLeave={presenter.handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center min-h-48 p-8 border border-dashed rounded-lg text-center transition-all ${
          presenter.isDragOver
            ? "border-[#6fa84f] bg-[#e9f5dd] scale-[1.01]"
            : "border-[#cfe3bf] bg-[#f6fcf0] hover:bg-[#eef8e4]"
        } ${isLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        onClick={handleBrowseClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          data-testid="upload-file-input"
          className="hidden"
          multiple
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={isLocked}
          onChange={handleFileInputChange}
          aria-label="Pilih file dokumen"
        />

        {body}
      </div>
    </div>
  );
}

export type DocumentUploadPageProps = {
  disabled?: boolean;
};

export function DocumentUploadPage({
  disabled = false,
}: DocumentUploadPageProps = {}): React.JSX.Element {
  const presenter = useDocumentUploadPresenter();

  return (
    <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-xl! font-semibold! leading-normal! tracking-normal! text-gray-900">
          Unggah Dokumen
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Unggah file PDF atau batch file DOCX untuk diproses ke dalam sistem manajemen dokumen.
        </p>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Unggah Dokumen</h1>
          <p className="text-sm text-gray-500 mt-1">
            Unggah file PDF atau batch file DOCX untuk diproses ke dalam sistem manajemen dokumen.
          </p>
        </div>
        <UserSessionBadge />
      </div>
      <DocumentUploadAreaView presenter={presenter} disabled={disabled} />
    </main>
  );
}

export const DocumentUploadFeature = DocumentUploadPage;
export const DocumentUploadContainer = DocumentUploadPage;
export const DocumentUploadView = DocumentUploadAreaView;
