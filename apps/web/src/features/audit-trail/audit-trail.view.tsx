import { useEffect, useRef, useState } from "react";
import type React from "react";
import {
  useAuditTrailPresenter,
  type AuditTrailPresenter,
  type AuditTrailRow,
} from "./audit-trail.presenter";
import { AuditIcon, ChevronIcon, SearchIcon } from "./audit-trail.icons";
import { CloseIcon } from "../document-detail/document-icons";
import "./audit-trail.css";

export type AuditTrailViewProps = {
  presenter?: AuditTrailPresenter;
};

function AuditDocumentCard({
  rows,
  onOpen,
}: {
  rows: AuditTrailRow[];
  onOpen: (row: AuditTrailRow, target: HTMLElement) => void;
}): React.JSX.Element | null {
  const first = rows[0];
  if (!first) return null;

  return (
    <button
      className="audit-trail__document-card"
      onClick={(event) => onOpen(first, event.currentTarget)}
      type="button"
    >
      <span className="audit-trail__document-card-main">
        <strong>{first.documentName}</strong>
        <span>
          {first.displayUser}
          {first.userEmail && first.userEmail !== first.displayUser ? ` · ${first.userEmail}` : ""}
        </span>
      </span>
      <time dateTime={first.downloadedAt}>{first.downloadedAtFormatted}</time>
    </button>
  );
}

function AuditDetailDrawer({
  row,
  rows,
  onClose,
  closeButtonRef,
  drawerRef,
}: {
  row: AuditTrailRow;
  rows: AuditTrailRow[];
  onClose: () => void;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  drawerRef: React.RefObject<HTMLElement | null>;
}): React.JSX.Element {
  return (
    <div className="audit-trail__drawer-backdrop" onMouseDown={onClose}>
      <aside
        aria-labelledby="audit-trail-drawer-title"
        aria-modal="true"
        className="audit-trail__drawer"
        onMouseDown={(event) => event.stopPropagation()}
        ref={drawerRef}
        role="dialog"
      >
        <header className="audit-trail__drawer-header">
          <h2 id="audit-trail-drawer-title">Log Detail</h2>
          <button
            aria-label="Tutup detail log"
            className="audit-trail__drawer-close"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="audit-trail__drawer-content">
          <section className="audit-trail__detail-field" aria-label="Nama dokumen">
            <span>File Name</span>
            <strong>{row.documentName}</strong>
          </section>
          <section className="audit-trail__detail-field" aria-label="Waktu unduh">
            <span>Waktu Unduh</span>
            <strong>
              <time dateTime={row.downloadedAt}>{row.downloadedAtFormatted}</time>
            </strong>
          </section>
          <section className="audit-trail__download-log" aria-labelledby="audit-trail-log-heading">
            <h3 id="audit-trail-log-heading">Download Log</h3>
            {rows.map((event) => (
              <div className="audit-trail__download-log-row" key={event.id}>
                <time dateTime={event.downloadedAt}>{event.downloadedAtFormatted}</time>
                <span className="audit-trail__download-log-rule" aria-hidden="true" />
                <span className="audit-trail__download-log-user">{event.displayUser}</span>
              </div>
            ))}
          </section>
        </div>
      </aside>
    </div>
  );
}

export function AuditTrailView({
  presenter: presenterProp,
}: AuditTrailViewProps = {}): React.JSX.Element {
  const defaultPresenter = useAuditTrailPresenter();
  const presenter = presenterProp ?? defaultPresenter;
  const [selectedRow, setSelectedRow] = useState<AuditTrailRow | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const closeDrawer = (): void => {
    setSelectedRow(null);
    returnFocusRef.current?.focus();
  };

  useEffect(() => {
    if (!selectedRow) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeDrawer();
        return;
      }
      if (event.key === "Tab") {
        const drawer = drawerRef.current;
        if (!drawer) return;
        const focusable = drawer.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (!drawer.contains(active)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedRow]);

  const documentGroups = new Map<string, AuditTrailRow[]>();
  for (const row of presenter.rows) {
    const key = row.documentId ?? `deleted-document:${row.documentName}`;
    const group = documentGroups.get(key) ?? [];
    group.push(row);
    documentGroups.set(key, group);
  }

  const selectedRows = selectedRow
    ? presenter.rows.filter((row) =>
        selectedRow.documentId
          ? row.documentId === selectedRow.documentId
          : row.documentName === selectedRow.documentName,
      )
    : [];

  const openDrawer = (row: AuditTrailRow, target: HTMLElement): void => {
    returnFocusRef.current = target;
    setSelectedRow(row);
  };

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
            placeholder="Search"
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
            type="button"
          >
            <ChevronIcon direction="left" />
          </button>
          <span className="audit-trail__page-number" role="status">
            {presenter.page}
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
      </div>

      {presenter.isLoading && (
        <div aria-busy="true" className="audit-trail__skeleton-list" role="status">
          {Array.from({ length: 5 }).map((_, index) => (
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
            {presenter.keyword ? "Tidak ada hasil pada halaman ini." : "Belum ada riwayat unduhan."}
          </p>
        </div>
      )}

      {!presenter.isLoading && !presenter.isError && !presenter.isEmpty && (
        <div className="audit-trail__document-list" aria-label="Daftar aktivitas unduhan">
          {[...documentGroups.entries()].map(([key, rows]) => (
            <AuditDocumentCard key={key} rows={rows} onOpen={openDrawer} />
          ))}
        </div>
      )}

      {!presenter.isLoading && !presenter.isError && presenter.totalItems > 0 && (
        <p className="audit-trail__result-count" aria-live="polite">
          {presenter.keyword.trim()
            ? `${presenter.rows.length} hasil pada halaman ${presenter.page}; total ${presenter.totalItems} aktivitas unduhan`
            : `Menampilkan ${presenter.firstItem}–${presenter.lastItem} dari ${presenter.totalItems} aktivitas unduhan`}
        </p>
      )}

      {selectedRow && (
        <AuditDetailDrawer
          row={selectedRow}
          rows={selectedRows}
          onClose={closeDrawer}
          closeButtonRef={closeButtonRef}
          drawerRef={drawerRef}
        />
      )}
    </section>
  );
}
