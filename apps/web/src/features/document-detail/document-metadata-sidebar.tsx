import type React from "react";
import { BookmarkIcon, CalendarIcon, FileIcon, GridIcon, UserIcon } from "./document-icons";
import type {
  DetailCategoryField,
  DetailTagsField,
  DetailUploadDateField,
} from "./document-detail-fields.presenter";
import { useRelatedDocumentsPresenter } from "./related-documents.presenter";
import { RelatedDocumentsView } from "./related-documents.view";

export type DocumentMetadataSidebarProps = {
  documentId: string;
  filename: string;
  author: string | null;
  tags: DetailTagsField;
  category: DetailCategoryField;
  uploadDate: DetailUploadDateField;
};

// Hook pencarian Dokumen Terkait hanya dipanggil saat bagian ini ditampilkan.
function RelatedDocumentsSection({ documentId }: { documentId: string }): React.JSX.Element {
  const related = useRelatedDocumentsPresenter(documentId);
  return <RelatedDocumentsView presenter={related} />;
}

export function DocumentMetadataSidebar({
  documentId,
  filename,
  author,
  tags,
  category,
  uploadDate,
}: DocumentMetadataSidebarProps): React.JSX.Element {
  const displayAuthor = author ?? "Tidak terdeteksi";
  // AC-07.01: Dokumen Terkait hanya ditampilkan untuk dokumen yang memiliki minimal satu tag.
  const showRelated = tags.status === "ready";

  return (
    <aside aria-label="Informasi Dokumen" className="document-detail-page__sidebar space-y-7">
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

          {/* Tags Card (AC-04.02): Smart Tags, maksimal 3 */}
          <div
            className="bg-[#f8fafc] border border-gray-100 rounded-xl p-3.5 flex items-start gap-3.5"
            data-testid="metadata-tags"
          >
            <div className="p-1.5 bg-white rounded-lg border border-gray-200/60 shrink-0 mt-0.5">
              <BookmarkIcon />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-sm text-gray-600 font-medium leading-snug mb-1">Tag</span>
              {tags.status === "empty" && (
                <span className="block text-sm text-gray-500">Tidak ada tag</span>
              )}
              {tags.status === "ready" && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Smart Tags">
                  {tags.names.map((name) => (
                    <li
                      key={name}
                      className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Category Card (AC-05.01) */}
          <div
            className="bg-[#f8fafc] border border-gray-100 rounded-xl p-3.5 flex items-start gap-3.5"
            data-testid="metadata-category"
          >
            <div className="p-1.5 bg-white rounded-lg border border-gray-200/60 shrink-0 mt-0.5">
              <GridIcon />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-sm text-gray-600 font-medium leading-snug mb-1">
                Kategori
              </span>
              {category.status === "empty" && (
                <span className="block text-sm text-gray-500">Tidak ada kategori</span>
              )}
              {category.status === "ready" && (
                <span className="block text-base font-semibold text-gray-800 [overflow-wrap:anywhere]">
                  {category.name}
                </span>
              )}
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
                {uploadDate.label}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Section: Related Documents (AC-07.01, AC-07.02) */}
      {showRelated && <RelatedDocumentsSection documentId={documentId} />}
    </aside>
  );
}
