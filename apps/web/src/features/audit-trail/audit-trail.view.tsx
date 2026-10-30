import type React from "react";
import { Link } from "react-router";
import {
  AUDIT_PAGE_SIZE,
  useAuditTrailPresenter,
  type AuditDocumentGroup,
  type AuditTrailPresenter,
} from "./audit-trail.presenter";
import { useUserSessionBadgePresenter } from "../auth/user-session-badge.presenter";
import { AuditLogDrawer } from "./audit-trail-drawer.view";
import { AuditIcon, ChevronIcon, HomeIcon, SearchIcon } from "./audit-trail.icons";
import "./audit-trail.css";

export type AuditTrailViewProps = {
  presenter?: AuditTrailPresenter;
};

function AuditDocumentRow({
  document,
  onOpen,
}: {
  document: AuditDocumentGroup;
  onOpen: () => void;
}): React.JSX.Element {
  return (
    <button className="audit-trail__document-row" onClick={onOpen} type="button">
      <span className="audit-trail__row-main">
        <strong className="audit-trail__document-name">{document.documentName}</strong>
        <span className="audit-trail__download-count">{document.totalDownloads} unduhan</span>
      </span>
      <time className="audit-trail__date" dateTime={document.latestDownloadedAt}>
        {document.latestDateFormatted}
      </time>
    </button>
  );
}

function AuditTrailContent({ presenter }: { presenter: AuditTrailPresenter }): React.JSX.Element {
  return (
    <>
      <header className="audit-trail__header">
        <h1>Audit Trail</h1>
        <label className="audit-trail__search">
          <SearchIcon />
          <span className="sr-only">Cari dokumen atau pengguna</span>
          <input
            onChange={(event) => presenter.setKeyword(event.currentTarget.value)}
            placeholder="Cari"
            type="search"
            value={presenter.keyword}
          />
        </label>
      </header>

      <div className="audit-trail__pagination" aria-label="Paginasi riwayat unduhan">
        <button
          aria-label="Halaman sebelumnya"
          disabled={!presenter.hasPrevPage}
          onClick={presenter.prevPage}
          type="button"
        >
          <ChevronIcon direction="left" />
        </button>
        <span aria-current="page" className="audit-trail__page-number">
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
      </div>

      {presenter.isLoading && (
        <div aria-busy="true" className="audit-trail__state" role="status">
          <div className="audit-trail__skeleton" />
          <div className="audit-trail__skeleton" />
          <div className="audit-trail__skeleton" />
          <span className="sr-only">Memuat riwayat unduhan...</span>
        </div>
      )}

      {presenter.isError && (
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
            {presenter.keyword
              ? "Tidak ada hasil untuk pencarian ini."
              : "Belum ada riwayat unduhan."}
          </p>
        </div>
      )}

      {!presenter.isLoading && !presenter.isError && !presenter.isEmpty && (
        <section aria-label="Daftar aktivitas unduhan" className="audit-trail__list">
          {presenter.items.map((document) => (
            <AuditDocumentRow
              document={document}
              key={document.key}
              onOpen={() => presenter.openDetail(document.key)}
            />
          ))}
        </section>
      )}

      {!presenter.isLoading && !presenter.isError && presenter.totalItems > 0 && (
        <p className="audit-trail__result-count">
          Menampilkan {(presenter.page - 1) * AUDIT_PAGE_SIZE + 1}–
          {Math.min(presenter.page * AUDIT_PAGE_SIZE, presenter.totalItems)} dari{" "}
          {presenter.totalItems} dokumen
        </p>
      )}

      {presenter.selectedDocument && (
        <AuditLogDrawer document={presenter.selectedDocument} onClose={presenter.closeDetail} />
      )}
    </>
  );
}

export function AuditTrailView({
  presenter: presenterProp,
}: AuditTrailViewProps = {}): React.JSX.Element {
  const session = useUserSessionBadgePresenter();
  const defaultPresenter = useAuditTrailPresenter();
  const presenter = presenterProp ?? defaultPresenter;

  return (
    <main className="audit-trail" data-testid="audit-trail-page">
      <title>Audit Trail | Axentra</title>
      <aside aria-label="Navigasi utama" className="audit-trail__sidebar">
        <div className="audit-trail__brand">
          <img alt="PERKASA" src="/src/assets/perkasa-logo-sidebar.png" />
        </div>
        <nav aria-label="Navigasi utama">
          <Link className="audit-trail__nav-link" to="/dashboard">
            <HomeIcon />
            <span>Dashboard</span>
          </Link>
          <span aria-current="page" className="audit-trail__nav-link is-active">
            <AuditIcon />
            <span>Audit Trail</span>
          </span>
        </nav>

        {session && (
          <div className="audit-trail__profile">
            <span aria-hidden="true" className="audit-trail__avatar">
              {session.initials}
            </span>
            <span className="audit-trail__profile-info">
              <strong>{session.displayName}</strong>
              <span>{session.roleLabel}</span>
            </span>
            <button
              aria-label="Keluar dari akun"
              className="audit-trail__logout-btn"
              disabled={session.isLoggingOut}
              onClick={() => void session.handleLogout()}
              type="button"
            >
              {session.logoutLabel}
            </button>
          </div>
        )}
      </aside>

      <div className="audit-trail__workspace">
        <AuditTrailContent presenter={presenter} />
      </div>
    </main>
  );
}
