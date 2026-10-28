import type React from "react";
import type { RecentDocumentsPresenter } from "./recent-documents.types";
import { BusyIcon, DownloadIcon } from "./recent-document-icons";

export type DownloadButtonProps = {
  presenter: RecentDocumentsPresenter;
};

export function DownloadButton({ presenter }: DownloadButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => void presenter.downloadSelected()}
      disabled={!presenter.canDownloadSelected}
      title={presenter.downloadDisabledReason}
      aria-busy={presenter.isDownloading}
      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#65a448] px-4 text-sm font-medium text-white transition-colors hover:bg-[#5b963f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#65a448] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
    >
      <span>Download Selected</span>
      {presenter.isDownloading ? <BusyIcon /> : <DownloadIcon />}
    </button>
  );
}
