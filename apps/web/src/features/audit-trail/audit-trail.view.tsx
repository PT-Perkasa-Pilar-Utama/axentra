import type React from "react";
import {
  useAuditTrailPresenter,
  type AuditTrailPresenter,
  type AuditTrailRow,
} from "./audit-trail.presenter";
import { useAuditDrawer } from "./use-audit-drawer";
import { AuditDetailDrawer } from "./audit-detail-drawer.view";
import { AuditIcon, ChevronIcon, SearchIcon } from "./audit-trail.icons";
import "./audit-trail.css";

const AUDIT_SKELETON_ROW_COUNT = 5;

export type AuditDocumentCardProps = {
  row: AuditTrailRow;
  onOpen: (row: AuditTrailRow, target: HTMLElement) => void;
};

function AuditDocumentCard({ row, onOpen }: AuditDocumentCardProps): React.JSX.Element {
  return (
    <button
      className="audit-trail__document-card"
      onClick={(event) => onOpen(row, event.currentTarget)}
      type="button"
    >
      <span className="audit-trail__document-card-main">
        <strong>{row.documentName}</strong>
        <span>
          {row.displayUser}
          {row.userEmail && row.userEmail !== row.displayUser ? ` · ${row.userEmail}` : ""}
        </span>
      </span>
      <time dateTime={row.downloadedAt}>{row.downloadedAtFormatted}</time>
    </button>
  );
}

export type AuditTrailViewProps = {
  presenter?: AuditTrailPresenter;
};

export function AuditTrailView({
  presenter: presenterProp,
}: AuditTrailViewProps = {}): React.JSX.Element {
  const defaultPresenter = useAuditTrailPresenter();
  const presenter = presenterProp ?? defaultPresenter;
  const drawer = useAuditDrawer(presenter.rows);

  return (
    <section
      aria-labelledby="audit-trail-heading"
      className="audit-trail-page"
      data-testid="audit-trail-page"
    >
      <title>Audit Trail | Axentra</title>
      <header className="audit-trail__header">
        <h1 id="audit-trail-heading">Auditrail</h1>
        <label className="audit-trail__search">
          <SearchIcon />
          <span className="sr-only">Cari dokumen atau pengguna</span>
          <input
            onChange={(event) => presenter.setKeyword(event.currentTarget.value)}
            placeholder="Cari dokumen atau pengguna"
            type="search"
            value={presenter.keyword}
          />
        </label>
      </header>

      <div className="audit-trail__toolbar">
        <span className="audit-trail__scope-note">Riwayat unduhan dokumen</span>
        <nav aria-label="Paginasi riwayat unduhan" className="audit-trail__pagination">
          <button
            aria-label="Halaman sebelumnya"
            disabled={!presenter.hasPrevPage}
            onClick={presenter.prevPage}
            title={!presenter.hasPrevPage ? "Sudah di halaman pertama" : "Ke halaman sebelumnya"}
            type="button"
          >
            <ChevronIcon direction="left" />
          </button>
          <span
            aria-label={`Halaman ${presenter.page} dari ${presenter.totalPages}`}
            className="audit-trail__page-number"
            role="status"
          >
            {presenter.page}
          </span>
          <button
            aria-label="Halaman berikutnya"
            disabled={!presenter.hasNextPage}
            onClick={presenter.nextPage}
            title={!presenter.hasNextPage ? "Sudah di halaman terakhir" : "Ke halaman berikutnya"}
            type="button"
          >
            <ChevronIcon direction="right" />
          </button>
        </nav>
      </div>

      {presenter.isLoading && (
        <div aria-busy="true" className="audit-trail__skeleton-list" role="status">
          {Array.from({ length: AUDIT_SKELETON_ROW_COUNT }).map((_, index) => (
            <div className="audit-trail__skeleton motion-safe:animate-pulse" key={index} />
          ))}
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
            {presenter.keyword ? "Tidak ada hasil yang ditemukan" : "Belum ada riwayat unduhan."}
          </p>
        </div>
      )}

      {!presenter.isLoading && !presenter.isError && !presenter.isEmpty && (
        <div className="audit-trail__document-list" aria-label="Daftar aktivitas unduhan">
          {presenter.rows.map((row) => (
            <AuditDocumentCard key={row.id} row={row} onOpen={drawer.openDrawer} />
          ))}
        </div>
      )}

      {!presenter.isLoading && !presenter.isError && presenter.totalItems > 0 && (
        <p className="audit-trail__result-count" aria-live="polite">
          {presenter.keyword.trim()
            ? `${presenter.rows.length} hasil pada halaman ${presenter.page} dari ${presenter.totalPages}; total ${presenter.totalItems} aktivitas unduhan`
            : `Menampilkan ${presenter.firstItem}–${presenter.lastItem} dari ${presenter.totalItems} aktivitas unduhan`}
        </p>
      )}

      {drawer.selectedRow && (
        <AuditDetailDrawer
          row={drawer.selectedRow}
          rows={drawer.selectedRows}
          onClose={drawer.closeDrawer}
          closeButtonRef={drawer.closeButtonRef}
          drawerRef={drawer.drawerRef}
        />
      )}
    </section>
  );
}
