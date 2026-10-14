import type React from "react";
import type { SearchDocumentsPresenter } from "./search-documents.presenter";

export type SearchResultsViewProps = {
  presenter: SearchDocumentsPresenter;
};

export function SearchResultsView({ presenter }: SearchResultsViewProps): React.JSX.Element | null {
  if (!presenter.keyword) return null;

  return (
    <section aria-label="Hasil Pencarian">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-gray-900">
          Hasil Pencarian: "{presenter.keyword}"
        </h2>
        <button
          type="button"
          onClick={presenter.clearSearch}
          className="rounded text-xs font-medium text-[#65a448] hover:text-green-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6fa84f] focus-visible:ring-offset-1"
        >
          Bersihkan Pencarian
        </button>
      </div>

      {presenter.isLoading && (
        <div
          className="flex min-h-48 items-center justify-center gap-2 rounded-2xl border border-[#e1e5e9] bg-white py-12 text-sm text-gray-500"
          role="status"
          aria-label="Memuat hasil pencarian"
        >
          <div
            className="h-5 w-5 animate-spin rounded-full border-2 border-[#6fa84f] border-t-transparent"
            aria-hidden="true"
          />
          Mencari dokumen...
        </div>
      )}

      {presenter.isError && !presenter.isLoading && (
        <div
          role="alert"
          className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-[#e1e5e9] bg-white py-12"
        >
          <p className="text-sm text-rose-600">Gagal memuat hasil pencarian.</p>
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
          Tidak ada hasil yang ditemukan untuk <strong>"{presenter.keyword}"</strong>
        </p>
      )}

      {presenter.hasResults && (
        <ul aria-label="Daftar hasil pencarian" className="space-y-1.5">
          {presenter.results.map((item) => (
            <li
              key={item.id}
              className="grid min-h-[4.5rem] grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-5 rounded-2xl border border-[#e1e5e9] bg-white px-5 py-4 md:px-8"
            >
              <input
                type="checkbox"
                aria-label={`Pilih ${item.filename}`}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-gray-300 accent-[#65a448]"
                disabled
                readOnly
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#535a63]">{item.filename}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {item.snippet ?? "Tidak ada cuplikan teks."}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
