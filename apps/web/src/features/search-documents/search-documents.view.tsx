import type React from "react";
import type { SearchDocumentsPresenter } from "./search-documents.presenter";

export type SearchViewProps = {
  presenter: SearchDocumentsPresenter;
};

export function SearchBarView({ presenter }: SearchViewProps): React.JSX.Element {
  return (
    <form onSubmit={presenter.handleSubmit} className="relative w-full max-w-[16rem]">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <svg
          className="h-4 w-4 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <input
        type="search"
        value={presenter.inputValue}
        onChange={(e) => presenter.handleInputChange(e.target.value)}
        placeholder="Cari dokumen..."
        className="block w-full rounded-full border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#6fa84f] focus:outline-none focus:ring-1 focus:ring-[#6fa84f]"
        aria-label="Cari dokumen"
      />
    </form>
  );
}

export function SearchResultsView({ presenter }: SearchViewProps): React.JSX.Element | null {
  if (!presenter.keyword) return null;
  const hasResults = !presenter.isLoading && !presenter.isError && presenter.results.length > 0;

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

      {hasResults && (
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
                <p className="mt-1 text-xs text-gray-500">{item.snippet}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
