import type React from "react";
import type { SearchDocumentsPresenter } from "./search-documents.presenter";

// Resolusi F7: Tipe props spesifik untuk komponen SearchBarView
export type SearchBarViewProps = {
  presenter: SearchDocumentsPresenter;
};

export function SearchBarView({ presenter }: SearchBarViewProps): React.JSX.Element {
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
