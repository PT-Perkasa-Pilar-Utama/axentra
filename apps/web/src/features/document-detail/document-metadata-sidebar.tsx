import type React from "react";
import { BookmarkIcon, CalendarIcon, FileIcon, GridIcon, UserIcon } from "./document-icons";

export type DocumentMetadataSidebarProps = {
  filename: string;
  author: string | null;
  uploadDate: string;
};

export function DocumentMetadataSidebar({
  filename,
  author,
  uploadDate,
}: DocumentMetadataSidebarProps): React.JSX.Element {
  const displayAuthor = author ?? "Tidak terdeteksi";

  return (
    <aside
      aria-label="Informasi Dokumen"
      className="min-w-0 order-first lg:order-none bg-white border-l border-gray-200 p-5 sm:p-6 space-y-7"
    >
      {/* Section: Meta Data */}
      <section className="space-y-3.5">
        <h2 className="text-sm font-semibold text-gray-600">Metadata</h2>

        <div className="space-y-2.5">
          {/* File Name Card */}
          <div className="bg-[#f8fafc] border border-gray-100 rounded-xl p-3.5 flex items-start gap-3.5">
            <div className="p-1.5 bg-white rounded-lg border border-gray-200/60 shrink-0 mt-0.5">
              <FileIcon />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-sm text-gray-600 font-medium leading-snug">
                Nama berkas
              </span>
              <span
                className="block text-base leading-relaxed font-semibold text-gray-800 [overflow-wrap:anywhere] mt-0.5"
                title={filename}
              >
                {filename}
              </span>
            </div>
          </div>

          {/* Author Card (AC-03.01 Critical) */}
          <div
            className="bg-[#f8fafc] border border-gray-100 rounded-xl p-3.5 flex items-start gap-3.5"
            data-testid="metadata-author"
          >
            <div className="p-1.5 bg-white rounded-lg border border-gray-200/60 shrink-0 mt-0.5">
              <UserIcon />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-sm text-gray-600 font-medium leading-snug">Penulis</span>
              <span
                className={`block text-base leading-relaxed [overflow-wrap:anywhere] mt-0.5 ${
                  author ? "text-gray-800 font-semibold" : "text-gray-600"
                }`}
              >
                {displayAuthor}
              </span>
            </div>
          </div>

          {/* Tags Card (Sprint 2 - AC-04.02) */}
          <div className="bg-[#f8fafc] border border-gray-100 rounded-xl p-3.5 flex items-start gap-3.5">
            <div className="p-1.5 bg-white rounded-lg border border-gray-200/60 shrink-0 mt-0.5">
              <BookmarkIcon />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-sm text-gray-600 font-medium leading-snug mb-1">Tag</span>
              <span className="text-base leading-relaxed text-gray-600">Belum tersedia</span>
            </div>
          </div>

          {/* Category Card (Sprint 2 - AC-05.01) */}
          <div className="bg-[#f8fafc] border border-gray-100 rounded-xl p-3.5 flex items-start gap-3.5">
            <div className="p-1.5 bg-white rounded-lg border border-gray-200/60 shrink-0 mt-0.5">
              <GridIcon />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-sm text-gray-600 font-medium leading-snug mb-1">
                Kategori
              </span>
              <span className="text-base leading-relaxed text-gray-600">Belum tersedia</span>
            </div>
          </div>

          {/* Upload Date Card */}
          <div className="bg-[#f8fafc] border border-gray-100 rounded-xl p-3.5 flex items-start gap-3.5">
            <div className="p-1.5 bg-white rounded-lg border border-gray-200/60 shrink-0 mt-0.5">
              <CalendarIcon />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-sm text-gray-600 font-medium leading-snug">
                Tanggal unggah
              </span>
              <span className="block text-base font-semibold text-gray-800 mt-0.5">
                {uploadDate}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Section: Related Documents (Sprint 2 - AC-07.01) */}
      <section className="space-y-3.5">
        <h2 className="text-sm font-semibold text-gray-600">Dokumen Terkait</h2>
        <div className="bg-[#f8fafc] border border-dashed border-gray-200 rounded-xl p-4 text-center">
          <p className="text-base leading-relaxed text-gray-600">
            Rekomendasi dokumen terkait belum tersedia pada versi ini.
          </p>
        </div>
      </section>
    </aside>
  );
}
