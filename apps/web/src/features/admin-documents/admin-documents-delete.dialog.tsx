import type React from "react";
import { useEffect, useRef } from "react";
import type { AdminDocumentsPresenter } from "./admin-documents.presenter";

export type DeleteConfirmDialogProps = {
  presenter: AdminDocumentsPresenter;
};

export function DeleteConfirmDialog({
  presenter,
}: DeleteConfirmDialogProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const target = presenter.deleteTarget;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !target) return;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [target]);

  if (!target) return null;

  return (
    <dialog
      aria-describedby="admin-documents-delete-description"
      aria-labelledby="admin-documents-delete-title"
      className="admin-documents__dialog"
      onCancel={(event) => {
        event.preventDefault();
        presenter.closeDeleteConfirm();
      }}
      ref={dialogRef}
    >
      <h2 id="admin-documents-delete-title">Hapus &ldquo;{target.title}&rdquo;?</h2>
      <p id="admin-documents-delete-description">
        Dokumen tidak akan tampil lagi di daftar dan pencarian. Data tetap tersimpan di server
        sebagai hapus lunak.
      </p>
      {presenter.mutationError && <p role="alert">{presenter.mutationError}</p>}
      <div className="admin-documents__dialog-actions">
        <button
          className="admin-documents__btn-cancel"
          disabled={presenter.isMutating}
          onClick={presenter.closeDeleteConfirm}
          type="button"
        >
          Batal
        </button>
        <button
          className="admin-documents__btn-confirm-delete"
          disabled={presenter.isMutating}
          onClick={() => void presenter.confirmDelete()}
          type="button"
        >
          {presenter.isMutating ? "Menghapus..." : "Hapus Dokumen"}
        </button>
      </div>
    </dialog>
  );
}
