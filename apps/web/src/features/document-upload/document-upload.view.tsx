import type React from "react";
import {
  useDocumentUploadPresenter,
  useDocumentUploadInteraction,
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
        disabled={disabled}
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
  const {
    isDragOver,
    fileInputRef,
    isLocked,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileInputChange,
    handleBrowseClick,
    handleRetryClick,
  } = useDocumentUploadInteraction(presenter, disabled);

  const handleBrowseButtonClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    handleBrowseClick();
  };

  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm" data-testid="document-upload-container">
      <DocumentUploadNotificationView presenter={presenter} />

      <div
        data-testid="upload-dropzone"
        role="region"
        aria-label="Area Unggah Dokumen"
        aria-busy={presenter.isBusy}
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
