import type React from "react";
import { useRef, useState } from "react";
import {
  useDocumentUploadPresenter,
  type DocumentUploadPresenter,
} from "./document-upload.presenter";

const fileOutlinePaths = [
  "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
  "M14 2v4a2 2 0 0 0 2 2h4",
];
const toastIconPaths = {
  success: [...fileOutlinePaths, "m9 15 2 2 4-4"],
  error: [...fileOutlinePaths, "m14.5 12.5-5 5", "m9.5 12.5 5 5"],
} as const;

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

  return (
    <div
      data-testid="upload-notification"
      className={`upload-notification fixed left-1/2 top-20 z-50 flex w-[min(550px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-4 px-6 py-4 rounded-xl text-sm text-gray-900 shadow-md backdrop-blur-sm transition-all ${
        isSuccess ? "bg-[#c9f0dc]/90" : "bg-[#f0a7a7]/90"
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
        <span>{isSuccess ? "Upload berhasil." : "Upload gagal."}</span>{" "}
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
    <div className="rounded-2xl bg-white p-3 shadow-sm" data-testid="document-upload-container">
      <DocumentUploadNotificationView presenter={presenter} />

      <div
        data-testid="upload-dropzone"
        role="region"
        aria-label="Area Unggah Dokumen"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center min-h-48 p-8 border border-dashed rounded-lg text-center transition-all ${
          isDragOver
            ? "border-[#6fa84f] bg-[#e9f5dd] scale-[1.01]"
            : "border-[#cfe3bf] bg-[#f6fcf0] hover:bg-[#eef8e4]"
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
              className="h-8 w-8 animate-spin rounded-full border-4 border-[#6fa84f] border-t-transparent"
              role="status"
              aria-label="Memuat"
            />
            <p className="text-sm font-medium text-gray-700">Mengunggah dokumen...</p>
          </div>
        ) : (
          <div data-testid="upload-empty-prompt" className="flex flex-col items-center gap-2 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e3f0d6] text-[#6fa84f]">
              <svg
                className="h-5 w-5"
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
            <p className="text-xs text-gray-500">
              <button
                type="button"
                data-testid="upload-browse-button"
                disabled={disabled || isUploading}
                onClick={(e) => {
                  e.stopPropagation();
                  handleBrowseClick();
                }}
                className="font-semibold text-[#6fa84f] focus:outline-none focus-visible:underline"
              >
                Klik di sini
              </button>{" "}
              untuk mengunggah file Anda
            </p>
            <p className="text-xs text-gray-400">
              Mendukung 1 file PDF atau hingga 10 file DOCX (maks. 50 MB)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function DocumentUploadPage(): React.JSX.Element {
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
      </div>
      <DocumentUploadAreaView presenter={presenter} />
    </main>
  );
}

export const DocumentUploadFeature = DocumentUploadPage;
export const DocumentUploadContainer = DocumentUploadPage;
export const DocumentUploadView = DocumentUploadAreaView;
