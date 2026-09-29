import type React from "react";

import type { TopTagsPresenter } from "./top-tags.presenter";

export type TopTagsViewProps = {
  presenter: TopTagsPresenter;
  /**
   * FE-S2-02 will pass the set of currently active tag IDs.
   * Omitted in FE-S2-01 — chips render in the default (inactive) style.
   */
  activeTagIds?: ReadonlySet<string>;
  /**
   * FE-S2-02 will wire this to presenter.toggleTag(id).
   * Omitted in FE-S2-01 — chips are non-interactive.
   */
  onTagClick?: (id: string) => void;
};

export function TopTagsView({
  presenter,
  activeTagIds,
  onTagClick,
}: TopTagsViewProps): React.JSX.Element | null {
  // Render nothing while loading or on error to avoid layout shift.
  // Empty tag list also renders nothing (context returned no qualifying tags).
  if (presenter.isLoading || presenter.isError || presenter.tags.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Top Tags">
      <span className="text-sm font-semibold text-gray-700">Top Tags :</span>
      <ul className="flex flex-wrap gap-2" role="list">
        {presenter.tags.map((tag) => {
          const isActive = activeTagIds?.has(tag.id) ?? false;
          const interactive = onTagClick != null;

          return (
            <li key={tag.id}>
              {interactive ? (
                <button
                  type="button"
                  onClick={() => onTagClick(tag.id)}
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
    </div>
  );
}
