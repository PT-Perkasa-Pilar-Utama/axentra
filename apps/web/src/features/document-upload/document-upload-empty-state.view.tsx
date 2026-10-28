import type React from "react";

export type UploadEmptyPromptStateProps = {
  disabled: boolean;
  onBrowse: (e?: React.MouseEvent<HTMLElement>) => void;
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
          onClick={(e) => {
            e.stopPropagation();
            onBrowse();
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
  );
}
