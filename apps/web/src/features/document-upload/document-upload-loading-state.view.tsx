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
