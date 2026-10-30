import type React from "react";
import type { RecentDocumentsPresenter } from "./recent-documents.types";
import { DownloadButton } from "./recent-document-download-button.view";
import { ChevronLeftIcon, ChevronRightIcon } from "./recent-document-icons";

export type RecentDocumentActionsProps = {
  presenter: RecentDocumentsPresenter;
};

const pageButtonClassName =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-[#65a448] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#65a448] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40";

export function RecentDocumentActions({
  presenter,
}: RecentDocumentActionsProps): React.JSX.Element {
  const { pagination } = presenter;
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-3 sm:gap-5">
      <nav aria-label="Navigasi halaman" className="flex items-center gap-2 text-gray-500">
        <button
          type="button"
          onClick={() => pagination.goToPrevious()}
          disabled={!pagination.canGoPrevious}
          aria-label="Halaman sebelumnya"
          className={pageButtonClassName}
        >
          <ChevronLeftIcon />
        </button>
        <span
          aria-live="polite"
          className="min-w-[7.5rem] text-center text-xs font-medium text-gray-700"
        >
          {pagination.pageLabel}
        </span>
        <button
          type="button"
          onClick={() => pagination.goToNext()}
          disabled={!pagination.canGoNext}
          aria-label="Halaman berikutnya"
          className={pageButtonClassName}
        >
          <ChevronRightIcon />
        </button>
      </nav>
      <DownloadButton presenter={presenter} />
    </div>
  );
}
