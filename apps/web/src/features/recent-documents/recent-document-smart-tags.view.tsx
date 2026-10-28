import type React from "react";
import type { DocumentSmartTagsState, RecentDocumentItem } from "./recent-documents.types";

export type DocumentSmartTagsProps = {
  state: DocumentSmartTagsState;
  status: RecentDocumentItem["processingStatus"];
};

export function DocumentSmartTags({
  state,
  status,
}: DocumentSmartTagsProps): React.JSX.Element | null {
  if (status !== "completed") return null;

  if (state.isLoading) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="h-5 w-16 animate-pulse rounded-full bg-blue-100" />
      </div>
    );
  }

  if (state.isError) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-rose-500">Gagal memuat tag</span>
        <button
          type="button"
          onClick={() => state.retry()}
          className="rounded text-xs text-rose-700 underline hover:text-rose-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-500"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  if (state.isEmpty) {
    return (
      <div className="flex items-center">
        <span className="text-xs text-gray-400">Tidak ada tag</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {state.tags.slice(0, 3).map((tag) => (
        <span
          key={tag.id}
          className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600"
        >
          {tag.name}
        </span>
      ))}
    </div>
  );
}
