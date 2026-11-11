import type React from "react";
import { useEffect, useRef } from "react";
import type { AdminDocumentsPresenter } from "./admin-documents.presenter";

export type DocumentDetailDialogProps = {
  presenter: AdminDocumentsPresenter;
};

function formatDetailDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DetailContent({ presenter }: { presenter: AdminDocumentsPresenter }): React.JSX.Element {
  if (presenter.isDetailLoading) {
    return <p role="status">Memuat metadata...</p>;
  }
  if (!presenter.detail) {
    return <p>Gagal memuat detail metadata.</p>;
  }
  const detail = presenter.detail;
  return (
    <dl className="admin-documents__detail-list">
      <div>
        <dt>Judul</dt>
        <dd>{detail.title}</dd>
      </div>
      <div>
        <dt>Pengunggah</dt>
        <dd>{detail.ownerName ?? "Tidak diketahui"}</dd>
      </div>
      <div>
        <dt>Kategori</dt>
        <dd>{detail.categoryName ?? "Tanpa kategori"}</dd>
      </div>
      <div>
        <dt>Penulis (Metadata)</dt>
        <dd>{detail.metadata?.author ?? "Tidak terdeteksi"}</dd>
      </div>
      <div>
        <dt>Tanggal Unggah</dt>
        <dd>{formatDetailDate(detail.uploadedAt)}</dd>
      </div>
      {detail.archivedAt && (
        <div>
          <dt>Tanggal Arsip</dt>
          <dd>{formatDetailDate(detail.archivedAt)}</dd>
        </div>
      )}
    </dl>
  );
}

export function DocumentDetailDialog({
  presenter,
}: DocumentDetailDialogProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectedId = presenter.selectedDetailId;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !selectedId) return;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [selectedId]);

  if (!selectedId) return null;

  return (
    <dialog
      aria-labelledby="admin-documents-detail-title"
      className="admin-documents__dialog"
      onCancel={(event) => {
        event.preventDefault();
        presenter.closeDetail();
      }}
      ref={dialogRef}
    >
      <h2 id="admin-documents-detail-title">Detail Metadata Dokumen</h2>
      <DetailContent presenter={presenter} />
      <div className="admin-documents__dialog-actions">
        <button
          className="admin-documents__btn-cancel"
          onClick={presenter.closeDetail}
          type="button"
        >
          Tutup
        </button>
      </div>
    </dialog>
  );
}
