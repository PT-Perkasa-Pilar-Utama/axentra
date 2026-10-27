import type React from "react";

import type { TopTagsPresenter } from "./top-tags.presenter";

export type TopTagsViewProps = {
  presenter: TopTagsPresenter;
  activeTagNames?: ReadonlySet<string>;
  onTagClick?: (name: string) => void;
};

export function TopTagsView({
  presenter,
  activeTagNames,
  onTagClick,
}: TopTagsViewProps): React.JSX.Element | null {
  const hasTags = presenter.tags.length > 0;

  if (presenter.isLoading && !hasTags) {
    return (
      <div className="flex h-7 items-center gap-2" aria-label="Memuat Top Tags">
        <div
          className="h-4 w-4 animate-spin rounded-full border-2 border-[#6fa84f] border-t-transparent"
          aria-hidden="true"
        />
        <span className="text-sm text-gray-500">Memuat tag...</span>
      </div>
    );
  }

  if (!hasTags && !presenter.isError) {
    return null;
  }

  // Chip tetap tampil saat gagal memuat agar filter aktif bisa dilepas.
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Top Tags">
      <span className="text-sm font-semibold text-gray-700">Top Tags :</span>
      {hasTags && (
        <ul className="flex flex-wrap gap-2" role="list">
          {presenter.tags.map((tag) => {
            const isActive = activeTagNames?.has(tag.name) ?? false;
            const interactive = onTagClick != null;

            return (
              <li key={tag.name}>
                {interactive ? (
                  <button
                    type="button"
                    onClick={() => onTagClick(tag.name)}
                    aria-pressed={isActive}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6fa84f] focus-visible:ring-offset-1 ${
                      isActive
                        ? "border-[#6fa84f] bg-[#e9f5dd] text-[#4a7a35] font-medium"
                        : "border-gray-300 bg-white text-gray-700 hover:border-[#6fa84f] hover:bg-[#f6fcf0]"
                    }`}
                  >
                    {tag.name}
                  </button>
                ) : (
                  <span className="rounded-full border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700">
                    {tag.name}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {presenter.isError && (
        <span className="flex items-center gap-2">
          <span className="text-sm text-rose-600">Gagal memuat filter tag.</span>
          <button
            type="button"
            onClick={() => void presenter.retry()}
            className="text-sm font-medium text-rose-700 underline hover:text-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
          >
            Coba lagi
          </button>
        </span>
      )}
    </div>
  );
}
