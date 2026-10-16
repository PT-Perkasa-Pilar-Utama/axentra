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
      aria-label="Download Selected"
      aria-busy={presenter.isDownloading}
      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#65a448] px-4 text-sm font-medium text-white transition-colors hover:bg-[#5b963f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#65a448] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
    >
      <span>{presenter.isDownloading ? "Mengunduh..." : "Download"}</span>
      <DownloadIcon />
    </button>
  );
}

export type RecentDocumentActionsProps = {
  presenter: RecentDocumentsPresenter;
};

export function RecentDocumentActions({
  presenter,
}: RecentDocumentActionsProps): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-3 sm:gap-5">
      <nav aria-label="Navigasi halaman" className="flex items-center gap-1 text-gray-500">
        <button
          type="button"
          disabled
          title="Fitur navigasi halaman belum tersedia"
          aria-label="Halaman sebelumnya"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ChevronLeftIcon />
        </button>
        <span
          aria-current="page"
          className="flex h-8 min-w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700"
        >
          1
        </span>
        <button
          type="button"
          disabled
          title="Fitur navigasi halaman belum tersedia"
          aria-label="Halaman berikutnya"
          className="rounded p-1 text-[#65a448] hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ChevronRightIcon />
        </button>
      </nav>
      <DownloadButton presenter={presenter} />
    </div>
  );
}
