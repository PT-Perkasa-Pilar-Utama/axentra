import type React from "react";
import type { RecentDocumentsPresenter } from "./recent-documents.presenter";

function ChevronLeftIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function DownloadIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function BusyIcon(): React.JSX.Element {
  return (
    <span
      className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent"
      aria-hidden="true"
    />
  );
}

export type DownloadButtonProps = {
  presenter: RecentDocumentsPresenter;
};

export function DownloadButton({ presenter }: DownloadButtonProps): React.JSX.Element {
  let disabledReason: string | undefined;
  if (presenter.selectedIds.size === 0) {
    disabledReason = "Pilih minimal satu dokumen untuk mengunduh";
  } else if (presenter.isDownloading) {
    disabledReason = "Sedang mengunduh dokumen...";
  }

  return (
    <button
      type="button"
      onClick={() => void presenter.downloadSelected()}
      disabled={presenter.selectedIds.size === 0 || presenter.isDownloading}
      title={disabledReason}
      aria-busy={presenter.isDownloading}
      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#65a448] px-4 text-sm font-medium text-white transition-colors hover:bg-[#5b963f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#65a448] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
    >
      <span>Download Selected</span>
      {presenter.isDownloading ? <BusyIcon /> : <DownloadIcon />}
    </button>
  );
}

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
          onClick={() => pagination.goToPage(pagination.page - 1)}
          disabled={!pagination.hasPrevious || pagination.isChanging}
          aria-label="Halaman sebelumnya"
          className={pageButtonClassName}
        >
          <ChevronLeftIcon />
        </button>
        <span
          aria-live="polite"
          className="min-w-[7.5rem] text-center text-xs font-medium text-gray-700"
        >
          {`Halaman ${pagination.page} dari ${pagination.totalPages}`}
        </span>
        <button
          type="button"
          onClick={() => pagination.goToPage(pagination.page + 1)}
          disabled={!pagination.hasNext || pagination.isChanging}
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
