import type React from "react";
import type { AuditDocumentGroup } from "./audit-trail.presenter";
import { CloseIcon } from "./audit-trail.icons";

function closeOnEscape(event: React.KeyboardEvent, onClose: () => void): void {
  if (event.key === "Escape") onClose();
}

export function AuditLogDrawer({
  document,
  onClose,
}: {
  document: AuditDocumentGroup;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <div className="audit-trail__overlay" onMouseDown={onClose}>
      <section
        aria-labelledby="audit-log-detail-title"
        aria-modal="true"
        className="audit-trail__drawer"
        onKeyDown={(event) => closeOnEscape(event, onClose)}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="audit-trail__drawer-header">
          <h2 id="audit-log-detail-title">Detail Log</h2>
          <button
            aria-label="Tutup detail log"
            className="audit-trail__close-button"
            onClick={onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </header>
        <div className="audit-trail__drawer-content">
          <div className="audit-trail__info-card">
            <span className="audit-trail__info-label">Nama dokumen</span>
            <strong>{document.documentName}</strong>
          </div>
          <p className="audit-trail__download-summary">{document.totalDownloads} unduhan</p>
          <section aria-labelledby="audit-download-log-title" className="audit-trail__log-section">
            <h3 id="audit-download-log-title">Riwayat Unduhan</h3>
            <ol className="audit-trail__log-list">
              {document.logs.map((log) => (
                <li className="audit-trail__log-entry" key={log.id}>
                  <time className="audit-trail__timestamp" dateTime={log.downloadedAt}>
                    {log.downloadedAtFormatted}
                  </time>
                  <span aria-hidden="true" className="audit-trail__log-connector" />
                  <span className="audit-trail__user-pill" title={log.userEmail ?? undefined}>
                    {log.userName}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </section>
    </div>
  );
}
