import { Link, useParams } from "react-router";
import { useDocumentDetailPresenter } from "./document-detail.presenter";

function formatStatus(status: string): string {
  switch (status) {
    case "processed":
      return "Selesai Diproses";
    case "processing":
      return "Sedang Diproses";
    case "queued":
      return "Dalam Antrean";
    case "failed":
      return "Gagal";
    default:
      return status;
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "processed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "processing":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "failed":
      return "bg-rose-100 text-rose-800 border-rose-200";
    default:
      return "bg-neutral-100 text-neutral-800 border-neutral-200";
  }
}

export function DocumentDetailView(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const presenter = useDocumentDetailPresenter(id ?? "");

  if (presenter.status === "loading") {
    return (
      <div className="min-h-screen bg-neutral-100 p-6 flex flex-col gap-6" aria-busy="true">
        <div className="max-w-4xl w-full mx-auto space-y-6">
          <div className="h-10 w-48 bg-neutral-200 rounded-lg animate-pulse" />
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-neutral-200 space-y-4">
            <div className="h-6 w-40 bg-neutral-200 rounded animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="h-18 bg-neutral-100 rounded-xl animate-pulse" />
              <div className="h-18 bg-neutral-100 rounded-xl animate-pulse" />
              <div className="h-18 bg-neutral-100 rounded-xl animate-pulse" />
              <div className="h-18 bg-neutral-100 rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (presenter.status === "error" || !presenter.document) {
    return (
      <div className="min-h-screen bg-neutral-100 p-6 flex flex-col items-center justify-center">
        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full border border-neutral-200">
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

  const { filename, author, tags, category, uploadDate, document } = presenter;
  const visibleTags = tags.slice(0, 3);

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col text-neutral-900">
      {/* Top Bar Navigation */}
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
      </header>

      {/* Main Content: Document Metadata Card */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6">
        <section className="bg-white rounded-2xl p-6 shadow-xs border border-neutral-200/80">
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-neutral-100">
            <h2 className="text-base font-bold text-neutral-900 tracking-tight">
              Metadata Dokumen
            </h2>
            <span
              className={`text-xs px-3 py-1 rounded-full font-medium border ${getStatusBadgeClass(
                document.processingStatus,
              )}`}
            >
              {formatStatus(document.processingStatus)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nama File */}
            <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-4 flex items-center gap-3">
              <span className="text-xl text-neutral-400" aria-hidden="true">
                📄
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-xs text-neutral-500 font-medium">Nama File</span>
                <span className="block text-sm font-semibold text-neutral-800 truncate">
                  {filename}
                </span>
              </div>
            </div>

            {/* Penulis / Author (Kunci AC-03.01) */}
            <div
              className="bg-neutral-50 border border-neutral-100 rounded-xl p-4 flex items-center gap-3"
              data-testid="metadata-author"
            >
              <span className="text-xl text-neutral-400" aria-hidden="true">
                👤
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-xs text-neutral-500 font-medium">Penulis</span>
                <span className="block text-sm font-semibold text-neutral-800 truncate">
                  {author || "—"}
                </span>
              </div>
            </div>

            {/* Tag (Maksimal 3 sesuai standar) */}
            <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-4 flex items-start gap-3">
              <span className="text-xl text-neutral-400 mt-0.5" aria-hidden="true">
                🏷️
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-xs text-neutral-500 font-medium mb-1.5">Tag</span>
                {visibleTags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {visibleTags.map((tag) => (
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

            {/* Kategori */}
            <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-4 flex items-center gap-3">
              <span className="text-xl text-neutral-400" aria-hidden="true">
                📁
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-xs text-neutral-500 font-medium">Kategori</span>
                <span className="block text-sm font-semibold text-neutral-800 truncate">
                  {category || "—"}
                </span>
              </div>
            </div>

            {/* Tanggal Unggah */}
            <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-4 flex items-center gap-3">
              <span className="text-xl text-neutral-400" aria-hidden="true">
                📅
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-xs text-neutral-500 font-medium">Tanggal Unggah</span>
                <span className="block text-sm font-semibold text-neutral-800 truncate">
                  {uploadDate || "—"}
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
