import type React from "react";
import { Link } from "react-router";
import { FileIcon } from "./document-icons";
import type { RelatedDocumentsPresenter } from "./related-documents.presenter";
import "./related-documents.css";

export type RelatedDocumentsViewProps = {
  presenter: RelatedDocumentsPresenter;
};

export function RelatedDocumentsView({ presenter }: RelatedDocumentsViewProps): React.JSX.Element {
  return (
    <section className="related-documents" aria-labelledby="related-documents-heading">
      <h2 id="related-documents-heading">Dokumen Terkait</h2>

      {presenter.status === "loading" && (
        <div
          className="related-documents__list"
          role="status"
          aria-label="Memuat dokumen terkait"
          aria-busy="true"
        >
          <span className="related-documents__skeleton" aria-hidden="true" />
          <span className="related-documents__skeleton" aria-hidden="true" />
        </div>
      )}

      {presenter.status === "error" && (
        <div className="related-documents__message">
          <p role="alert">Dokumen terkait gagal dimuat. Coba muat ulang.</p>
          <button
            id="related-documents-retry"
            className="related-documents__retry"
            type="button"
            onClick={presenter.retry}
          >
            Coba lagi
          </button>
        </div>
      )}

      {presenter.status === "empty" && (
        <p className="related-documents__message" role="status">
          Belum ada dokumen dengan tag yang sama.
        </p>
      )}

      {presenter.status === "ready" && (
        <ul className="related-documents__list" aria-label="Daftar dokumen terkait">
          {presenter.items.map((item) => {
            const tagSummary = item.sharedTags.join(", ");
            return (
              <li key={item.id}>
                <Link
                  id={`related-document-${item.id}`}
                  className="related-documents__card"
                  to={item.href}
                  aria-label={`Buka ${item.filename}. Tag yang sama: ${tagSummary}`}
                >
                  <span className="related-documents__icon" aria-hidden="true">
                    <FileIcon />
                  </span>
                  <span className="related-documents__content">
                    <span className="related-documents__title">{item.filename}</span>
                    <span
                      className="related-documents__tags"
                      aria-label={`Tag yang sama: ${tagSummary}`}
                    >
                      {item.sharedTags.map((tag) => (
                        <span className="related-documents__tag" key={`${item.id}-${tag}`}>
                          {tag}
                        </span>
                      ))}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
