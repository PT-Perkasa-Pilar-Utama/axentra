import type React from "react";
import { Link, useParams } from "react-router";
import { useDocumentDetailPresenter } from "./document-detail.presenter";
import { CloseIcon, DownloadIcon, FileIcon } from "./document-icons";
import { DocumentMetadataSidebar } from "./document-metadata-sidebar";

export function DocumentDetailView(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const presenter = useDocumentDetailPresenter(id ?? "");

  if (presenter.status === "loading") {
    return (
      <div className="min-h-dvh bg-[#f3f4f6] flex flex-col" aria-busy="true">
        <span className="sr-only" role="status">
          Memuat metadata dokumen...
        </span>
        <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between">
          <div className="h-6 w-48 bg-gray-200 rounded motion-safe:animate-pulse" />
          <div className="h-9 w-28 bg-gray-200 rounded-lg motion-safe:animate-pulse" />
        </header>
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[5.5rem_minmax(0,1fr)_21.5rem] gap-4 p-6">
          <div className="hidden lg:flex flex-col gap-4">
            <div className="w-16 h-22 bg-gray-200 rounded motion-safe:animate-pulse" />
            <div className="w-16 h-22 bg-gray-200 rounded motion-safe:animate-pulse" />
          </div>
          <div className="bg-gray-200/60 rounded-xl min-h-[500px] motion-safe:animate-pulse" />
          <div className="space-y-4">
            <div className="h-14 bg-gray-200 rounded-xl motion-safe:animate-pulse" />
            <div className="h-14 bg-gray-200 rounded-xl motion-safe:animate-pulse" />
            <div className="h-14 bg-gray-200 rounded-xl motion-safe:animate-pulse" />
          </div>
        </main>
      </div>
    );
  }

  if (presenter.status === "error" || !presenter.document) {
    return (
      <div className="min-h-dvh bg-[#f3f4f6] flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full border border-gray-200">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <CloseIcon />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Gagal memuat metadata</h2>
          <p className="text-sm text-gray-500 mb-6">
            Metadata belum tersedia atau gagal dimuat. Tunggu pemrosesan selesai, lalu coba lagi.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/dashboard"
              className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-gray-700"
            >
              Kembali ke Dasbor
            </Link>
            <button
              type="button"
              onClick={presenter.retry}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#477532] hover:bg-[#365b26] rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-green-800 focus-visible:ring-offset-2 cursor-pointer"
            >
              Coba Lagi
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { filename, author, uploadDate } = presenter;

  return (
    <div className="min-h-dvh bg-[#e5e7eb] flex flex-col text-gray-900 font-sans">
      {/* Top Header Bar */}
      <header className="h-16 bg-white border-b border-gray-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20 shadow-xs">
        <div className="flex flex-1 items-center gap-3 min-w-0">
          <Link
            to="/dashboard"
            className="shrink-0 min-h-11 min-w-11 flex items-center justify-center text-gray-700 hover:text-black transition-colors p-2 rounded-lg hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-[#65a448]"
            aria-label="Kembali ke Dasbor"
          >
            <CloseIcon />
          </Link>
          <h1 className="text-base sm:text-lg font-bold text-gray-900 truncate" title={filename}>
            {filename}
          </h1>
        </div>

        <div className="shrink-0">
          <button
            type="button"
            disabled
            className="flex min-h-11 items-center gap-2 bg-gray-200 text-gray-600 text-sm font-medium px-4 py-2 rounded-lg cursor-not-allowed"
            aria-describedby="download-note"
          >
            <span>Unduh</span>
            <DownloadIcon />
          </button>
        </div>
      </header>

      {/* Main 3-Column Layout Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[5.5rem_minmax(0,1fr)_21.5rem] min-h-[calc(100dvh-4rem)]">
        {/* Left Column: Thumbnails Rail - unavailable until FE-S3-01 */}
        <aside
          aria-label="Thumbnail belum tersedia"
          className="hidden lg:flex flex-col items-center gap-3 py-8 px-2 bg-white border-r border-gray-200"
        >
          <FileIcon />
          <span className="text-sm text-gray-600 text-center">Belum tersedia</span>
        </aside>

        {/* Center Column: Document Preview Canvas */}
        <main
          aria-label="Area Pratinjau Dokumen"
          className="min-w-0 bg-[#d6d9de] p-6 sm:p-10 flex items-center justify-center min-h-80"
        >
          <section aria-labelledby="preview-heading" className="w-full max-w-lg text-center">
            <h2 id="preview-heading" className="text-2xl font-semibold text-gray-900">
              Pratinjau belum tersedia
            </h2>
            <p className="mt-4 text-base leading-relaxed text-gray-700">
              Isi berkas belum dapat ditampilkan di aplikasi ini. Metadata yang tersedia dapat
              dibaca pada panel informasi dokumen.
            </p>
            <p className="mt-4 text-base leading-relaxed text-gray-700">
              Untuk membaca isinya sekarang, buka berkas asli di perangkat Anda.
            </p>
            <p id="download-note" className="mt-6 text-sm leading-relaxed text-gray-600">
              Fitur pratinjau dan unduh belum tersedia pada versi ini.
            </p>
          </section>
        </main>

        {/* Right Column: Meta Data & Related Documents Sidebar */}
        <DocumentMetadataSidebar filename={filename} author={author} uploadDate={uploadDate} />
      </div>
    </div>
  );
}
