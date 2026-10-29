import type React from "react";

export type UploadProcessingStateProps = {
  onUploadAnother: () => void;
};

export function UploadProcessingState({
  onUploadAnother,
}: UploadProcessingStateProps): React.JSX.Element {
  return (
    <div data-testid="upload-processing-state" className="flex flex-col items-center gap-3 py-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e3f0d6] text-[#6fa84f]">
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
          <circle cx="12" cy="12" r="9" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-700">File diterima, menunggu diproses</p>
      <p className="max-w-xs text-center text-xs text-gray-500">
        Dokumen Anda sudah masuk antrean pemrosesan. Anda bisa mengunggah dokumen lain sekarang.
      </p>
      <button
        type="button"
        data-testid="upload-another-button"
        onClick={(e) => {
          e.stopPropagation();
          onUploadAnother();
        }}
        className="rounded-md bg-[#6fa84f] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#5f9243] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6fa84f] focus-visible:ring-offset-2"
      >
        Unggah Dokumen Lain
      </button>
    </div>
  );
}
