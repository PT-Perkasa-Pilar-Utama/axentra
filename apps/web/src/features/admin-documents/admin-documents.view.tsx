import type React from "react";
import {
  useAdminDocumentsPresenter,
  type AdminDocumentsPresenter,
} from "./admin-documents.presenter";
import type { AdminDocument } from "./admin-documents.api";
import { DeleteConfirmDialog } from "./admin-documents-delete.dialog";
import { DocumentDetailDialog } from "./admin-documents-detail.dialog";
import { ArchiveConfirmDialog } from "./admin-documents-archive.dialog";
import "./admin-documents.css";

export const ADMIN_DOCUMENTS_PAGE_TITLE = "Manajemen Dokumen";

function formatDocumentDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function SearchIcon(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="admin-documents__search-icon"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export type AdminDocumentsViewProps = {
  presenter?: AdminDocumentsPresenter;
};

export function AdminDocumentsView({
  presenter: presenterProp,
}: AdminDocumentsViewProps = {}): React.JSX.Element {
  const defaultPresenter = useAdminDocumentsPresenter();
  const presenter = presenterProp ?? defaultPresenter;

  const isArchivedTab = presenter.currentTab === "archived";

  let emptyMessage = isArchivedTab
    ? "Tidak ada dokumen diarsipkan pada halaman ini."
    : "Tidak ada dokumen aktif pada halaman ini.";
  if (presenter.searchQuery.trim()) emptyMessage = "Tidak ada judul yang cocok pada halaman ini.";

  return (
    <section aria-label="Manajemen dokumen" className="admin-documents">
      <div className="admin-documents__header">
        <div>
          <p className="admin-documents__subtitle">
            Admin hanya melihat metadata. Pratinjau dan unduhan isi tidak tersedia untuk Admin.
          </p>
        </div>
        <div className="admin-documents__search">
          <SearchIcon />
          <input
            aria-label="Cari judul dokumen pada halaman ini"
            onChange={(e) => presenter.setSearchQuery(e.target.value)}
            placeholder="Cari judul dokumen..."
            type="search"
            value={presenter.searchQuery}
          />
        </div>
      </div>

      <p className="admin-documents__scope">
        Filter status dan pencarian berlaku pada halaman ini. Gunakan navigasi halaman untuk melihat
        dokumen lainnya.
      </p>
      <div
        className="admin-documents__tabs"
        aria-label="Status dokumen pada halaman ini"
        role="tablist"
      >
        <button
          aria-selected={!isArchivedTab}
          className={`admin-documents__tab ${!isArchivedTab ? "is-active" : ""}`}
          onClick={() => presenter.setTab("active")}
          role="tab"
          type="button"
        >
          Aktif
        </button>
        <button
          aria-selected={isArchivedTab}
          className={`admin-documents__tab ${isArchivedTab ? "is-active" : ""}`}
          onClick={() => presenter.setTab("archived")}
          role="tab"
          type="button"
        >
          Diarsipkan
        </button>
      </div>

      {presenter.isLoading && <p role="status">Memuat daftar dokumen...</p>}
      {presenter.isAccessDenied && (
        <div role="alert">
          <h2>Akses Dibatasi</h2>
          <p>Anda tidak memiliki izin untuk melihat dokumen.</p>
        </div>
      )}
      {presenter.isError && (
        <div role="alert">
          <p>Daftar dokumen gagal dimuat.</p>
          <button onClick={presenter.retry} type="button">
            Coba lagi
          </button>
        </div>
      )}

      {!presenter.isLoading && !presenter.isError && !presenter.isAccessDenied && (
        <div className="admin-documents__table-container">
          {presenter.items.length === 0 ? (
            <p className="admin-documents__empty">{emptyMessage}</p>
          ) : (
            <div className="admin-documents__table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Judul dokumen</th>
                    <th>Pengunggah</th>
                    <th>{isArchivedTab ? "Diarsipkan" : "Tanggal unggah"}</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {presenter.items.map((doc: AdminDocument) => (
                    <tr key={doc.id}>
                      <td>
                        <button
                          type="button"
                          className="admin-documents__title-btn"
                          onClick={() => presenter.openDetail(doc)}
                        >
                          {doc.title}
                        </button>
                      </td>
                      <td>{doc.ownerName ?? "Tidak diketahui"}</td>
                      <td>
                        <time
                          dateTime={isArchivedTab ? (doc.archivedAt ?? undefined) : doc.uploadedAt}
                        >
                          {formatDocumentDate(isArchivedTab ? doc.archivedAt : doc.uploadedAt)}
                        </time>
                      </td>
                      <td>
                        <span
                          className={`admin-documents__status admin-documents__status--${
                            doc.archivedAt ? "archived" : "active"
                          }`}
                        >
                          {doc.archivedAt ? "Diarsipkan" : "Aktif"}
                        </span>
                      </td>
                      <td>
                        <div className="admin-documents__actions">
                          {doc.archivedAt ? (
                            <button
                              aria-label={`Batalkan arsip dokumen ${doc.title}`}
                              className="admin-documents__btn"
                              disabled={presenter.isMutating}
                              onClick={() => presenter.openUnarchiveConfirm(doc)}
                              type="button"
                            >
                              Batalkan Arsip
                            </button>
                          ) : (
                            <button
                              aria-label={`Arsipkan dokumen ${doc.title}`}
                              className="admin-documents__btn"
                              disabled={presenter.isMutating}
                              onClick={() => presenter.openArchiveConfirm(doc)}
                              type="button"
                            >
                              Arsipkan
                            </button>
                          )}
                          <button
                            aria-label={`Hapus dokumen ${doc.title}`}
                            className="admin-documents__btn admin-documents__btn--delete"
                            disabled={presenter.isMutating}
                            onClick={() => presenter.openDeleteConfirm(doc)}
                            type="button"
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="admin-documents__pagination">
            <span>
              Halaman {presenter.page} · {presenter.items.length} dokumen ditampilkan ·{" "}
              {presenter.total} dokumen total (aktif dan arsip)
            </span>
            <div>
              <button
                disabled={!presenter.hasPrevious}
                onClick={presenter.previousPage}
                type="button"
              >
                Sebelumnya
              </button>
              <button disabled={!presenter.hasNext} onClick={presenter.nextPage} type="button">
                Berikutnya
              </button>
            </div>
          </div>
        </div>
      )}

      <DeleteConfirmDialog presenter={presenter} />
      <ArchiveConfirmDialog presenter={presenter} />
      <DocumentDetailDialog presenter={presenter} />
    </section>
  );
}
