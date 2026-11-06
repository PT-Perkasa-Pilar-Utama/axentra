import type React from "react";
import { useEffect, useRef } from "react";
import type { AdminDocumentsPresenter } from "./admin-documents.presenter";

export function ArchiveConfirmDialog({
  presenter,
}: {
  presenter: AdminDocumentsPresenter;
}): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const target = presenter.archiveTarget ?? presenter.unarchiveTarget;
  const isUnarchive = presenter.unarchiveTarget !== null;
  const close = isUnarchive ? presenter.closeUnarchiveConfirm : presenter.closeArchiveConfirm;
  const confirm = isUnarchive ? presenter.confirmUnarchive : presenter.confirmArchive;

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

  let confirmLabel = isUnarchive ? "Batalkan Arsip" : "Arsipkan Dokumen";
  if (presenter.isMutating) {
    confirmLabel = "Memproses...";
  }

  return (
    <dialog
      ref={dialogRef}
      className="admin-documents__dialog"
      aria-labelledby="admin-documents-archive-title"
      aria-describedby="admin-documents-archive-description"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <h2 id="admin-documents-archive-title">
        {isUnarchive ? "Batalkan arsip" : "Arsipkan"} &ldquo;{target.title}&rdquo;?
      </h2>
      <p id="admin-documents-archive-description">
        {isUnarchive
          ? "Dokumen akan kembali aktif sesuai izin yang berlaku."
          : "Dokumen tidak akan muncul di daftar dan pencarian Member Team maupun Head of Team."}
      </p>
      {presenter.mutationError && <p role="alert">{presenter.mutationError}</p>}
      <div className="admin-documents__dialog-actions">
        <button
          className="admin-documents__btn-cancel"
          disabled={presenter.isMutating}
          onClick={close}
          type="button"
        >
          Batal
        </button>
        <button
          className="admin-documents__btn-confirm-archive"
          disabled={presenter.isMutating}
          onClick={() => void confirm()}
          type="button"
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
