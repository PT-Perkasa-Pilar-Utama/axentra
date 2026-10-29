import { useRef } from "react";
import type React from "react";
import { useDocumentUploadAreaPresenter } from "./document-upload-area.presenter";
import { DocumentUploadNotificationView } from "./document-upload-notification.view";
import { UploadEmptyPromptState } from "./document-upload-empty-state.view";
import { UploadLoadingState } from "./document-upload-loading-state.view";
import { UploadProcessingState } from "./document-upload-processing-state.view";
import { UploadRetryState } from "./document-upload-retry-state.view";
import type { DocumentUploadPresenter } from "./document-upload.presenter";

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
  const area = useDocumentUploadAreaPresenter({ presenter, disabled, fileInputRef });

  return (
    <div className="rounded-2xl bg-white p-3 space-y-3" data-testid="document-upload-container">
      <DocumentUploadNotificationView
        notification={area.notification}
        onDismiss={presenter.dismissNotification}
      />

      <div
        data-testid="upload-dropzone"
        role="region"
        aria-label="Area Unggah Dokumen"
        aria-busy={presenter.isBusy}
        onDragOver={area.handleDragOver}
        onDragLeave={presenter.handleDragLeave}
        onDrop={area.handleDrop}
        className={`relative flex flex-col items-center justify-center min-h-48 p-8 border border-dashed rounded-lg text-center transition-all ${
          presenter.isDragOver
            ? "border-[#6fa84f] bg-[#e9f5dd] scale-[1.01]"
            : "border-[#cfe3bf] bg-[#f6fcf0] hover:bg-[#eef8e4]"
        } ${area.isLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        onClick={area.handleBrowseClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          data-testid="upload-file-input"
          className="hidden"
          multiple
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={area.isLocked}
          onChange={area.handleFileInputChange}
          aria-label="Pilih file dokumen"
        />

        {area.stage === "uploading" && <UploadLoadingState />}
        {area.stage === "processing" && (
          <UploadProcessingState onUploadAnother={presenter.uploadAnother} />
        )}
        {area.stage === "retry" && (
          <UploadRetryState
            retainedFileNames={area.retainedFileNames}
            disabled={area.isLocked}
            onRetry={area.handleRetryClick}
            onChooseOther={area.handleBrowseClick}
          />
        )}
        {area.stage === "empty" && (
          <UploadEmptyPromptState disabled={area.isLocked} onBrowse={area.handleBrowseClick} />
        )}
      </div>
    </div>
  );
}
