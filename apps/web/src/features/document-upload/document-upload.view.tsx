import type React from "react";
import { useRef, useState } from "react";
import type { DocumentUploadPresenter } from "./document-upload.presenter";

export type DocumentUploadNotificationViewProps = {
  presenter: DocumentUploadPresenter;
};

export function DocumentUploadNotificationView({
  presenter,
}: DocumentUploadNotificationViewProps): React.JSX.Element | null {
  const { notification, dismissNotification } = presenter;
  if (!notification) return null;

  const isSuccess = notification.type === "success";

  return (
    <div
      data-testid="upload-notification"
      className={`upload-notification flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
        isSuccess
          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
          : "bg-rose-50 border-rose-200 text-rose-800"
      }`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
            isSuccess ? "bg-emerald-200 text-emerald-900" : "bg-rose-200 text-rose-900"
          }`}
          aria-hidden="true"
        >
          {isSuccess ? "✓" : "✕"}
        </span>
        <span data-testid="notification-message">{notification.message}</span>
      </div>
      <button
        type="button"
        onClick={dismissNotification}
        className="text-gray-400 hover:text-gray-600 focus:outline-none text-base font-bold p-1 leading-none cursor-pointer"
        aria-label="Tutup notifikasi"
      >
        ✕
      </button>
    </div>
  );
}

export type DocumentUploadAreaViewProps = {
  presenter: DocumentUploadPresenter;
  disabled?: boolean;
};

export function DocumentUploadAreaView({
  presenter,
  disabled = false,
}: DocumentUploadAreaViewProps): React.JSX.Element {
  const { isUploading, uploadFiles } = presenter;
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isUploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled || isUploading) return;

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      void uploadFiles(droppedFiles);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    if (selectedFiles.length > 0) {
      void uploadFiles(selectedFiles);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleBrowseClick = (): void => {
    if (!disabled && !isUploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="space-y-4" data-testid="document-upload-container">
      <DocumentUploadNotificationView presenter={presenter} />

      <div
        data-testid="upload-dropzone"
        role="region"
        aria-label="Area Unggah Dokumen"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl text-center transition-all ${
          isDragOver
            ? "border-blue-500 bg-blue-50/50 scale-[1.01]"
            : "border-gray-200 bg-gray-50/50 hover:bg-gray-50"
        } ${disabled || isUploading ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        onClick={handleBrowseClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          data-testid="upload-file-input"
          className="hidden"
          multiple
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={disabled || isUploading}
          onChange={handleFileInputChange}
          aria-label="Pilih file dokumen"
        />

        {isUploading ? (
          <div data-testid="upload-loading-state" className="flex flex-col items-center gap-3 py-4">
            <div
              className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"
              role="status"
              aria-label="Memuat"
            />
            <p className="text-sm font-medium text-gray-700">Mengunggah dokumen...</p>
          </div>
        ) : (
          <div data-testid="upload-empty-prompt" className="flex flex-col items-center gap-3 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-gray-900">
                Pilih atau seret file PDF atau DOCX ke sini
              </p>
              <p className="text-xs text-gray-500">
                Mendukung 1 file PDF atau hingga 10 file DOCX (maks. 50 MB)
              </p>
            </div>
            <button
              type="button"
              data-testid="upload-browse-button"
              disabled={disabled || isUploading}
              onClick={(e) => {
                e.stopPropagation();
                handleBrowseClick();
              }}
              className="mt-2 inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
            >
              Pilih File
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Alias for convenience
export const DocumentUploadView = DocumentUploadAreaView;
