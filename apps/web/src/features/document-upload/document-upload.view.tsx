import type React from "react";
import { useRef, useState } from "react";
import {
  useDocumentUploadPresenter,
  type DocumentUploadPresenter,
} from "./document-upload.presenter";
import { DocumentUploadNotificationView } from "./document-upload-notification.view";
import {
  UploadEmptyPromptState,
  UploadLoadingState,
  UploadProcessingState,
  UploadRetryState,
} from "./document-upload-dropzone-states.view";

export type DropzoneBodyProps = {
  presenter: DocumentUploadPresenter;
  disabled: boolean;
  onBrowse: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onRetry: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

/**
 * Komponen React (bukan sekadar function call) supaya callback yang membawa
 * closure atas fileInputRef hanya tereksekusi lewat event handler, bukan saat
 * render — menghindari lint react-compiler "refs: cannot access ref during render".
 */
function DropzoneBody({
  presenter,
  disabled,
  onBrowse,
  onRetry,
}: DropzoneBodyProps): React.JSX.Element {
  if (presenter.isUploading) {
    return <UploadLoadingState />;
  }

  if (presenter.isProcessing) {
    return <UploadProcessingState />;
  }

  if (presenter.canRetry) {
    return (
      <UploadRetryState
        pendingFiles={presenter.pendingFiles}
        onRetry={onRetry}
        onChooseOther={onBrowse}
      />
    );
  }

  return <UploadEmptyPromptState disabled={disabled} onBrowse={onBrowse} />;
}

export type DocumentUploadAreaViewProps = {
  presenter: DocumentUploadPresenter;
  disabled?: boolean;
};

export function DocumentUploadAreaView({
  presenter,
  disabled = false,
}: DocumentUploadAreaViewProps): React.JSX.Element {
  const { isBusy, uploadFiles, retry } = presenter;
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLocked = disabled || isBusy;

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLocked) {
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
    if (isLocked) return;

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
    // Nilai input dikosongkan agar file yang sama bisa dipilih ulang; objek File
    // tetap disimpan presenter sebagai pendingFiles untuk keperluan retry.
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleBrowseClick = (): void => {
    if (!isLocked && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleBrowseButtonClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    handleBrowseClick();
  };

  const handleRetryClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    void retry();
  };

  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm" data-testid="document-upload-container">
      <DocumentUploadNotificationView presenter={presenter} />

      <div
        data-testid="upload-dropzone"
        role="region"
        aria-label="Area Unggah Dokumen"
        aria-busy={isBusy}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center min-h-48 p-8 border border-dashed rounded-lg text-center transition-all ${
          isDragOver
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

        <DropzoneBody
          presenter={presenter}
          disabled={isLocked}
          onBrowse={handleBrowseButtonClick}
          onRetry={handleRetryClick}
        />
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

export { DocumentUploadNotificationView } from "./document-upload-notification.view";
export const DocumentUploadFeature = DocumentUploadPage;
export const DocumentUploadContainer = DocumentUploadPage;
export const DocumentUploadView = DocumentUploadAreaView;
