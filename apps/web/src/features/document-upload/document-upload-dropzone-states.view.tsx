import type React from "react";

export function UploadLoadingState(): React.JSX.Element {
  return (
    <div data-testid="upload-loading-state" className="flex flex-col items-center gap-3 py-4">
      <div
        className="h-8 w-8 animate-spin rounded-full border-4 border-[#6fa84f] border-t-transparent"
        role="status"
        aria-label="Memuat"
      />
      <p className="text-sm font-medium text-gray-700">Mengunggah dokumen...</p>
    </div>
  );
}

export function UploadProcessingState(): React.JSX.Element {
  return (
    <div data-testid="upload-processing-state" className="flex flex-col items-center gap-3 py-4">
      <div
        className="h-8 w-8 animate-spin rounded-full border-4 border-[#4f86a8] border-t-transparent"
        role="status"
        aria-label="Memproses"
      />
      <p className="text-sm font-medium text-gray-700">Dokumen sedang diproses...</p>
      <p className="text-xs text-gray-500">
        File diterima untuk diproses. Anda dapat menunggu di halaman ini.
      </p>
    </div>
  );
}

export type UploadRetryStateProps = {
  pendingFiles: File[];
  disabled: boolean;
  onRetry: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onChooseOther: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

export function UploadRetryState({
  pendingFiles,
  disabled,
  onRetry,
  onChooseOther,
}: UploadRetryStateProps): React.JSX.Element {
  return (
    <div data-testid="upload-retry-state" className="flex flex-col items-center gap-3 py-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f8dede] text-[#b45353]">
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
            d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-700">Unggahan gagal dikirim</p>
      <p data-testid="upload-retained-files" className="max-w-sm text-xs text-gray-500">
        File masih tersimpan: {pendingFiles.map((file) => file.name).join(", ")}
      </p>
      <button
        type="button"
        data-testid="upload-retry-button"
        disabled={disabled}
        aria-disabled={disabled}
        title={disabled ? "Tidak dapat mengulang unggahan saat ini" : undefined}
        onClick={onRetry}
        className={`rounded-md px-4 py-2 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
          disabled
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : "bg-[#6fa84f] text-white hover:bg-[#5f9243] focus-visible:ring-[#6fa84f]"
        }`}
      >
        Coba unggah lagi
      </button>
      <button
        type="button"
        data-testid="upload-choose-other-button"
        disabled={disabled}
        aria-disabled={disabled}
        title={disabled ? "Tidak dapat memilih file saat ini" : undefined}
        onClick={onChooseOther}
        className={`text-xs underline focus:outline-none ${
          disabled
            ? "text-gray-300 cursor-not-allowed"
            : "text-gray-500 focus-visible:text-gray-700"
        }`}
      >
        Pilih file lain
      </button>
    </div>
  );
}

export type UploadEmptyPromptStateProps = {
  disabled: boolean;
  onBrowse: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

export function UploadEmptyPromptState({
  disabled,
  onBrowse,
}: UploadEmptyPromptStateProps): React.JSX.Element {
  return (
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
          disabled={disabled}
          onClick={onBrowse}
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
  );
}
