import type React from "react";
import { useQuery } from "@tanstack/react-query";
import { getDocumentSmartTags } from "./recent-documents.api";
import type { RecentDocumentsPresenter } from "./recent-documents.presenter";

const emptyMessage = "Tidak ada hasil yang ditemukan";

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

function DocumentSmartTags({ documentId }: { documentId: string }): React.JSX.Element | null {
  const { data: tags = [], isLoading } = useQuery({
    queryKey: ["document-smart-tags", documentId],
    queryFn: () => getDocumentSmartTags(documentId),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="hidden flex-wrap items-center gap-1.5 md:flex">
        <div className="h-5 w-16 animate-pulse rounded-full bg-gray-200" />
      </div>
    );
  }

  if (tags.length === 0) return null;

  return (
    <div className="hidden flex-wrap items-center gap-1.5 md:flex">
      {tags.slice(0, 3).map((tag) => (
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

export type RecentDocumentsViewProps = {
  presenter: RecentDocumentsPresenter;
};

export function RecentDocumentsView({ presenter }: RecentDocumentsViewProps): React.JSX.Element {
  const hasItems = !presenter.isLoading && !presenter.isError && presenter.items.length > 0;

  return (
    <section aria-label="Semua dokumen">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-gray-900">Semua Dokumen</h2>
        <nav aria-label="Navigasi halaman" className="flex items-center gap-1 text-gray-500">
          <button
            type="button"
            disabled
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
            aria-label="Halaman berikutnya"
            className="rounded p-1 text-[#65a448] hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ChevronRightIcon />
          </button>
        </nav>
      </div>

      {presenter.isLoading && (
        <div
          className="flex min-h-48 items-center justify-center gap-2 rounded-2xl border border-[#e1e5e9] bg-white py-12 text-sm text-gray-500"
          role="status"
          aria-label="Memuat daftar dokumen"
        >
          <div
            className="h-5 w-5 animate-spin rounded-full border-2 border-[#6fa84f] border-t-transparent"
            aria-hidden="true"
          />
          Memuat dokumen...
        </div>
      )}

      {presenter.isError && !presenter.isLoading && (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-[#e1e5e9] bg-white py-12">
          <p className="text-sm text-rose-600">Gagal memuat dokumen.</p>
          <button
            type="button"
            onClick={presenter.retry}
            className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            Coba lagi
          </button>
        </div>
      )}

      {presenter.isEmpty && (
        <p className="flex min-h-48 items-center justify-center rounded-2xl border border-[#e1e5e9] bg-white px-4 py-12 text-center text-sm text-gray-500">
          {emptyMessage}
        </p>
      )}

      {hasItems && (
        <ul aria-label="Daftar dokumen" className="space-y-1.5">
          {presenter.items.map((item) => (
            <li
              key={item.id}
              className="grid min-h-[4.5rem] grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-5 rounded-2xl border border-[#e1e5e9] bg-white px-5 py-3 md:grid-cols-[1.25rem_minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(8rem,auto)_minmax(6rem,auto)] md:px-8"
            >
              <input
                type="checkbox"
                aria-label={`Pilih ${item.filename}`}
                className="h-5 w-5 shrink-0 rounded border-gray-300 accent-[#65a448]"
                readOnly
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#535a63]">{item.filename}</p>
                <p className="mt-1 text-xs text-gray-500 md:hidden">
                  {item.statusLabel} · {item.dateLabel}
                </p>
              </div>

              {/* Pemanggilan komponen Smart Tags diletakkan di sini */}
              <DocumentSmartTags documentId={item.id} />

              <p className="hidden text-sm font-medium text-[#535a63] md:block">
                {item.statusLabel}
              </p>
              <div className="hidden shrink-0 text-right md:block">
                <p className="text-xs text-[#9aa2ad]">{item.dateLabel}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
