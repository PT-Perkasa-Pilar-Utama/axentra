import type React from "react";

export type UploadRetryStateProps = {
  /** Nama berkas yang masih tersimpan untuk dicoba ulang, sudah digabung presenter. */
  retainedFileNames: string;
  disabled: boolean;
  onRetry: (e: React.MouseEvent<HTMLElement>) => void;
  onChooseOther: (e?: React.MouseEvent<HTMLElement>) => void;
};

export function UploadRetryState({
  retainedFileNames,
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
        File masih tersimpan: {retainedFileNames}
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
