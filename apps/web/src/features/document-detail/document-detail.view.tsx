import { Link, useParams } from "react-router";
import { useDocumentDetailPresenter } from "./document-detail.presenter";

export function DocumentDetailView(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const presenter = useDocumentDetailPresenter(id ?? "");

  if (presenter.status === "loading") {
    return (
      <div className="min-h-screen bg-neutral-100 p-6 flex flex-col gap-6" aria-busy="true">
        <div className="h-12 w-64 bg-neutral-200 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
          <div className="lg:col-span-2 bg-white rounded-2xl p-8 shadow-sm h-96 animate-pulse" />
          <div className="space-y-4">
            <div className="h-20 bg-white rounded-xl shadow-sm animate-pulse" />
            <div className="h-20 bg-white rounded-xl shadow-sm animate-pulse" />
            <div className="h-20 bg-white rounded-xl shadow-sm animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (presenter.status === "error" || !presenter.document) {
    return (
      <div className="min-h-screen bg-neutral-100 p-6 flex flex-col items-center justify-center">
        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full">
          <span className="text-4xl mb-4 block" aria-hidden="true">
            ⚠️
          </span>
          <h2 className="text-lg font-bold text-neutral-800 mb-2">Gagal Memuat Dokumen</h2>
          <p className="text-sm text-neutral-500 mb-6">
            Terjadi kesalahan saat memuat metadata dokumen atau dokumen tidak ditemukan.
          </p>
          <div className="flex justify-center gap-3">
            <Link
              to="/"
              className="px-4 py-2 text-sm font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition"
            >
              Kembali ke Dasbor
            </Link>
            <button
              type="button"
              onClick={presenter.retry}
              className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition cursor-pointer"
            >
              Coba Lagi
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { filename, author, tags, category, uploadDate } = presenter;

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col text-neutral-900">
      {/* Top Bar */}
      <header className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-xs">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="text-neutral-500 hover:text-neutral-800 transition p-1.5 rounded-lg hover:bg-neutral-100 text-lg font-bold leading-none"
            aria-label="Kembali ke Dasbor"
          >
            ✕
          </Link>
          <h1 className="text-base md:text-lg font-bold text-neutral-900 truncate max-w-md">
            {filename}
          </h1>
        </div>
        <div>
          <button
            type="button"
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-sm font-semibold transition shadow-xs cursor-pointer"
          >
            <span>Download</span>
            <span aria-hidden="true">📥</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left / Center Document Preview Canvas */}
        <div className="lg:col-span-8 flex flex-col md:flex-row gap-4">
          {/* Thumbnails */}
          <div className="hidden md:flex flex-col gap-3 w-16 shrink-0">
            <div className="border-2 border-emerald-500 rounded-lg p-1 bg-white shadow-xs cursor-pointer">
              <div className="w-full h-20 bg-neutral-100 rounded flex items-center justify-center text-xs text-neutral-400">
                1
              </div>
            </div>
            <div className="border border-neutral-200 rounded-lg p-1 bg-white opacity-60 hover:opacity-100 transition shadow-xs cursor-pointer">
              <div className="w-full h-20 bg-neutral-100 rounded flex items-center justify-center text-xs text-neutral-400">
                2
              </div>
            </div>
          </div>

          {/* Main Viewer Sheet */}
          <div className="flex-1 bg-neutral-200/70 rounded-2xl p-6 md:p-8 flex items-center justify-center min-h-[500px]">
            <div className="bg-white rounded-lg shadow-md max-w-md w-full p-6 border border-neutral-200 flex flex-col gap-4">
              <div className="border-b border-neutral-100 pb-3 flex justify-between items-center">
                <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                  Document Preview
                </span>
                <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-medium">
                  {presenter.document.processingStatus}
                </span>
              </div>
              <div className="space-y-2 py-4">
                <div className="h-4 bg-neutral-100 rounded w-3/4" />
                <div className="h-3 bg-neutral-100 rounded w-full" />
                <div className="h-3 bg-neutral-100 rounded w-5/6" />
                <div className="h-3 bg-neutral-100 rounded w-4/6" />
              </div>
              <div className="pt-4 border-t border-neutral-100 text-xs text-neutral-400 text-center">
                Halaman 1 dari 2
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Meta Data Panel */}
        <aside className="lg:col-span-4 flex flex-col gap-6">
          <section className="bg-white rounded-2xl p-5 shadow-xs border border-neutral-200/80">
            <h2 className="text-sm font-bold text-neutral-900 mb-4 tracking-tight">Meta Data</h2>
            <div className="flex flex-col gap-3">
              {/* File Name Card */}
              <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-3 flex items-center gap-3">
                <span className="text-xl text-neutral-400" aria-hidden="true">
                  📄
                </span>
                <div className="min-w-0">
                  <span className="block text-xs text-neutral-500 font-medium">File Name</span>
                  <span className="block text-sm font-semibold text-neutral-800 truncate">
                    {filename}
                  </span>
                </div>
              </div>

              {/* Author Card (AC-03.01) */}
              <div
                className="bg-neutral-50 border border-neutral-100 rounded-xl p-3 flex items-center gap-3"
                data-testid="metadata-author"
              >
                <span className="text-xl text-neutral-400" aria-hidden="true">
                  👤
                </span>
                <div className="min-w-0">
                  <span className="block text-xs text-neutral-500 font-medium">Author</span>
                  <span className="block text-sm font-semibold text-neutral-800 truncate">
                    {author || "—"}
                  </span>
                </div>
              </div>

              {/* Tags Card */}
              <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-3 flex items-start gap-3">
                <span className="text-xl text-neutral-400 mt-0.5" aria-hidden="true">
                  🏷️
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs text-neutral-500 font-medium mb-1.5">Tags</span>
                  {tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-400 italic">Tidak ada tag</span>
                  )}
                </div>
              </div>

              {/* Category Card */}
              <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-3 flex items-center gap-3">
                <span className="text-xl text-neutral-400" aria-hidden="true">
                  📁
                </span>
                <div className="min-w-0">
                  <span className="block text-xs text-neutral-500 font-medium">Category</span>
                  <span className="block text-sm font-semibold text-neutral-800 truncate">
                    {category || "—"}
                  </span>
                </div>
              </div>

              {/* Upload Date Card */}
              <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-3 flex items-center gap-3">
                <span className="text-xl text-neutral-400" aria-hidden="true">
                  📅
                </span>
                <div className="min-w-0">
                  <span className="block text-xs text-neutral-500 font-medium">Upload Date</span>
                  <span className="block text-sm font-semibold text-neutral-800 truncate">
                    {uploadDate || "—"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Related Documents Section Preview */}
          <section className="bg-white rounded-2xl p-5 shadow-xs border border-neutral-200/80">
            <h2 className="text-sm font-bold text-neutral-900 mb-4 tracking-tight">
              Related Documents
            </h2>
            <div className="flex flex-col gap-2.5">
              <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <span className="block text-xs font-semibold text-neutral-800 truncate">
                    CustomerAdvise
                  </span>
                  <div className="flex gap-1 mt-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                      Strategy
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                      AI
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <span className="block text-xs font-semibold text-neutral-800 truncate">
                    DosumentCustomerReport
                  </span>
                  <div className="flex gap-1 mt-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                      Strategy
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
