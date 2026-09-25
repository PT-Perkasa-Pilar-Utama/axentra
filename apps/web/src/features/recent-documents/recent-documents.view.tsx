import type React from "react";

import type { RecentDocumentsPresenter } from "./recent-documents.presenter";

// Required empty-state copy (CODING_STANDARD section 11).
const emptyMessage = "Tidak ada hasil yang ditemukan";

export type RecentDocumentsViewProps = {
  presenter: RecentDocumentsPresenter;
};

export function RecentDocumentsView({ presenter }: RecentDocumentsViewProps): React.JSX.Element {
  const hasItems = !presenter.isLoading && !presenter.isError && presenter.items.length > 0;

  return (
    <section aria-label="Dokumen terbaru" className="mt-6">
      <div className="rounded-t-2xl border border-b-0 border-gray-200 bg-white px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Dokumen Terbaru</h2>
      </div>

      {presenter.isLoading && (
        <div
          className="flex items-center justify-center gap-2 rounded-b-2xl border border-gray-200 bg-white py-12 text-sm text-gray-500"
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
        <div className="flex flex-col items-center gap-3 rounded-b-2xl border border-gray-200 bg-white py-12">
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
        <p className="rounded-b-2xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-500">
          {emptyMessage}
        </p>
      )}

      {hasItems && (
        <ul
          aria-label="Daftar dokumen"
          className="divide-y divide-gray-100 rounded-b-2xl border border-t-0 border-gray-200 bg-white"
        >
          {presenter.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                disabled
                title="Pemilihan dokumen belum tersedia"
                aria-label={`Pilih ${item.filename}`}
                className="h-4 w-4 shrink-0 rounded border-gray-300 accent-[#6fa84f]"
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{item.filename}</p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-xs font-medium text-gray-700">{item.statusLabel}</p>
                <p className="text-xs text-gray-500">{item.dateLabel}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
