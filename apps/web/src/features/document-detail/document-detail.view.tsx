import type React from "react";
import { Link, useParams } from "react-router";
import { useDocumentDetailPresenter } from "./document-detail.presenter";
import type { DownloadButtonTone, DownloadNoteTone } from "./document-detail-download.presenter";
import { CloseIcon, DownloadIcon, FileIcon } from "./document-icons";
import { DocumentDocxPreview } from "./document-docx-preview.view";
import { DocumentMetadataSidebar } from "./document-metadata-sidebar";
import "./document-preview.css";

const DOWNLOAD_BUTTON_CLASS: Record<DownloadButtonTone, string> = {
  primary: "bg-[#477532] text-white hover:bg-[#365b26] focus-visible:ring-green-800",
  busy: "bg-[#e8f0e4] text-[#477532] cursor-wait",
  blocked: "bg-gray-200 text-gray-500 cursor-not-allowed",
};

const DOWNLOAD_NOTE_CLASS: Record<DownloadNoteTone, string> = {
  muted: "text-gray-500",
  error: "text-rose-600",
};

export type DocumentDetailViewProps = {
  presenterOptions?: Parameters<typeof useDocumentDetailPresenter>[1];
};

export function DocumentDetailView({
  presenterOptions,
}: DocumentDetailViewProps = {}): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const presenter = useDocumentDetailPresenter(id ?? "", presenterOptions);

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

  if (presenter.status === "error" || !presenter.document || !presenter.fields) {
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

  const { filename, downloadControl } = presenter;
  const fields = presenter.fields;

  return (
    <div className="document-detail-page min-h-dvh flex flex-col text-gray-900 font-sans">
      {/* Top Header Bar */}
      <header className="document-detail-page__header bg-white px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <Link
            id="document-preview-close"
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

        <div className="shrink-0 flex flex-col items-end gap-1">
          <button
            id="document-preview-download"
            type="button"
            onClick={presenter.handleDownload}
            disabled={downloadControl.isBlocked}
            className={`flex min-h-11 items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 ${DOWNLOAD_BUTTON_CLASS[downloadControl.buttonTone]}`}
            aria-describedby="download-note"
          >
            <span>{downloadControl.label}</span>
            <DownloadIcon />
          </button>

          <span
            id="download-note"
            role="status"
            aria-live="polite"
            className={`text-xs ${DOWNLOAD_NOTE_CLASS[downloadControl.noteTone]}`}
          >
            {downloadControl.note}
          </span>
        </div>
      </header>

      {/* Main 3-Column Layout Workspace */}
      <div className="document-detail-page__body flex-1">
        <aside aria-label="Halaman dokumen" className="document-detail-page__rail">
          <span className="document-detail-page__rail-icon" aria-hidden="true">
            <FileIcon />
          </span>
          <span>Thumbnail halaman belum tersedia</span>
        </aside>

        <main aria-label="Area Pratinjau Dokumen" className="document-detail-page__canvas">
          {presenter.previewStatus === "loading" && (
            <div className="document-preview-state" role="status" aria-busy="true">
              <p>Memuat pratinjau dokumen...</p>
            </div>
          )}

          {presenter.previewStatus === "error" && (
            <section className="document-preview-state" aria-labelledby="preview-error-heading">
              <h2 id="preview-error-heading">Pratinjau gagal dimuat</h2>
              <p>Dokumen belum dapat ditampilkan. Coba muat ulang pratinjau.</p>
              <button type="button" onClick={presenter.retryPreview}>
                Coba lagi
              </button>
            </section>
          )}

          {presenter.previewView === "docx" && presenter.docxPreview !== null && (
            <DocumentDocxPreview
              state={presenter.docxPreview}
              onRetry={presenter.retryDocxPreview}
            />
          )}

          {presenter.previewStatus === "ready" &&
            presenter.previewView === "pdf" &&
            presenter.preview &&
            presenter.previewFrameSrc !== null && (
              <iframe
                className="document-preview-frame"
                src={presenter.previewFrameSrc}
                title={`Pratinjau ${presenter.preview.filename}`}
                referrerPolicy="no-referrer"
              />
            )}

          {presenter.previewStatus === "ready" &&
            presenter.previewView === "unsupported" &&
            presenter.preview && (
              <section className="document-preview-state" aria-labelledby="preview-format-heading">
                <span className="document-detail-page__empty-icon" aria-hidden="true">
                  <FileIcon />
                </span>
                <h2 id="preview-format-heading">Pratinjau belum tersedia untuk format ini</h2>
                <p>
                  Berkas {presenter.preview.filename} sudah ditemukan, tetapi format{" "}
                  {presenter.previewFormatLabel} belum didukung untuk tampilan inline.
                </p>
              </section>
            )}
        </main>

        {/* Right Column: Meta Data & Related Documents Sidebar */}
        <DocumentMetadataSidebar
          documentId={presenter.document.id}
          filename={filename}
          author={fields.author}
          tags={fields.tags}
          category={fields.category}
          uploadDate={fields.uploadDate}
          showRelated={fields.showRelated}
        />
      </div>
    </div>
  );
}
