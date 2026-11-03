import type React from "react";
import type { AuditTrailRow } from "./audit-trail.presenter";
import { CloseIcon } from "../document-detail/document-icons";
import "./audit-trail-drawer.css";

export type AuditDetailDrawerProps = {
  row: AuditTrailRow;
  rows: AuditTrailRow[];
  onClose: () => void;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  drawerRef: React.RefObject<HTMLElement | null>;
};

export function AuditDetailDrawer({
  row,
  rows,
  onClose,
  closeButtonRef,
  drawerRef,
}: AuditDetailDrawerProps): React.JSX.Element {
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
          <h2 id="audit-trail-drawer-title">Detail Log</h2>
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
            <span>Nama Dokumen</span>
            <strong>{row.documentName}</strong>
          </section>
          <section className="audit-trail__detail-field" aria-label="Waktu unduh">
            <span>Waktu Unduh</span>
            <strong>
              <time dateTime={row.downloadedAt}>{row.downloadedAtFormatted}</time>
            </strong>
          </section>
          <section className="audit-trail__download-log" aria-labelledby="audit-trail-log-heading">
            <h3 id="audit-trail-log-heading">Riwayat Unduhan</h3>
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
