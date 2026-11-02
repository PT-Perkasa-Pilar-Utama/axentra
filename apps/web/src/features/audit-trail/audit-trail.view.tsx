import type React from "react";
import {
  useAuditTrailPresenter,
  type AuditTrailPresenter,
  type AuditTrailRow,
} from "./audit-trail.presenter";
import { AuditIcon, ChevronIcon, SearchIcon } from "./audit-trail.icons";
import "./audit-trail.css";

export type AuditTrailViewProps = {
  presenter?: AuditTrailPresenter;
};

function AuditTableRow({ row }: { row: AuditTrailRow }): React.JSX.Element {
  return (
    <tr className="audit-trail__table-row">
      <td className="audit-trail__cell-user">
        <strong className="audit-trail__user-name">{row.displayUser}</strong>
        {row.userEmail && row.userEmail !== row.displayUser && (
          <span className="audit-trail__user-email">{row.userEmail}</span>
        )}
      </td>
      <td className="audit-trail__cell-document">
        <span className="audit-trail__document-name">{row.documentName}</span>
      </td>
      <td className="audit-trail__cell-time">
        <time dateTime={row.downloadedAt}>{row.downloadedAtFormatted}</time>
      </td>
    </tr>
  );
}

export function AuditTrailView({
  presenter: presenterProp,
}: AuditTrailViewProps = {}): React.JSX.Element {
  const defaultPresenter = useAuditTrailPresenter();
  const presenter = presenterProp ?? defaultPresenter;

  return (
    <section
      aria-labelledby="audit-trail-heading"
      className="audit-trail-page"
      data-testid="audit-trail-page"
    >
      <title>Audit Trail | Axentra</title>
      <header className="audit-trail__header">
        <h1 id="audit-trail-heading">Audit Trail</h1>
        <div className="audit-trail__search-container">
          <label className="audit-trail__search">
            <SearchIcon />
            <span className="sr-only">Cari dokumen atau pengguna</span>
            <input
              onChange={(event) => presenter.setKeyword(event.currentTarget.value)}
              placeholder="Cari pada halaman ini (nama, dokumen, email)..."
              type="search"
              value={presenter.keyword}
            />
          </label>
          {presenter.keyword.trim().length > 0 && (
            <span className="audit-trail__search-hint" role="status">
              Menyaring baris pada halaman {presenter.page}
            </span>
          )}
        </div>
      </header>

      <nav aria-label="Paginasi riwayat unduhan" className="audit-trail__pagination">
        <button
          aria-label="Halaman sebelumnya"
          disabled={!presenter.hasPrevPage}
          onClick={presenter.prevPage}
          type="button"
        >
          <ChevronIcon direction="left" />
        </button>
        <span className="audit-trail__page-number" role="status">
          Halaman {presenter.page} dari {presenter.totalPages}
        </span>
        <button
          aria-label="Halaman berikutnya"
          disabled={!presenter.hasNextPage}
          onClick={presenter.nextPage}
          type="button"
        >
          <ChevronIcon direction="right" />
        </button>
      </nav>

      {presenter.isLoading && (
        <div aria-busy="true" className="audit-trail__state" role="status">
          <div className="audit-trail__skeleton motion-safe:animate-pulse" />
          <div className="audit-trail__skeleton motion-safe:animate-pulse" />
          <div className="audit-trail__skeleton motion-safe:animate-pulse" />
          <span className="sr-only">Memuat riwayat unduhan...</span>
        </div>
      )}

      {presenter.isAccessDenied && (
        <div className="audit-trail__state" role="alert">
          <h2>Akses Dibatasi</h2>
          <p>Anda tidak memiliki izin untuk melihat riwayat unduhan.</p>
        </div>
      )}

      {presenter.isError && !presenter.isAccessDenied && (
        <div className="audit-trail__state" role="alert">
          <p>Riwayat unduhan gagal dimuat.</p>
          <button
            className="audit-trail__retry-button"
            onClick={() => void presenter.retry()}
            type="button"
          >
            Coba lagi
          </button>
        </div>
      )}

      {presenter.isEmpty && (
        <div className="audit-trail__state">
          <span aria-hidden="true" className="audit-trail__empty-icon">
            <AuditIcon />
          </span>
          <p>
            {presenter.keyword ? "Tidak ada hasil pada halaman ini." : "Belum ada riwayat unduhan."}
          </p>
        </div>
      )}

      {!presenter.isLoading && !presenter.isError && !presenter.isEmpty && (
        <div className="audit-trail__table-container">
          <table aria-label="Riwayat Unduhan Dokumen" className="audit-trail__table">
            <thead>
              <tr>
                <th scope="col">Pengguna</th>
                <th scope="col">Nama Dokumen</th>
                <th scope="col">Waktu Unduh</th>
              </tr>
            </thead>
            <tbody>
              {presenter.rows.map((row) => (
                <AuditTableRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!presenter.isLoading && !presenter.isError && presenter.totalItems > 0 && (
        <p className="audit-trail__result-count" aria-live="polite">
          {presenter.keyword.trim()
            ? `${presenter.rows.length} hasil pada halaman ${presenter.page}; total ${presenter.totalItems} aktivitas unduhan`
            : `Menampilkan ${presenter.firstItem}–${presenter.lastItem} dari ${presenter.totalItems} aktivitas unduhan`}
        </p>
      )}
    </section>
  );
}
