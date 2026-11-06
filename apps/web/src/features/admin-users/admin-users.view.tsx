import type React from "react";
import { useEffect, useRef } from "react";
import { useAdminUsersPresenter, type AdminUsersPresenter } from "./admin-users.presenter";
import "./admin-users.css";

export const ADMIN_USERS_PAGE_TITLE = "Manajemen Akun";

type ConfirmDialogProps = {
  presenter: AdminUsersPresenter;
};

function ConfirmDialog({ presenter }: ConfirmDialogProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const target = presenter.confirmTarget;
  const isDeactivate = target?.status === "active";
  const action = isDeactivate ? "Nonaktifkan" : "Aktifkan";
  const displayName = target?.name?.trim() || target?.email || "akun ini";

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
      aria-describedby="admin-users-confirm-description"
      aria-labelledby="admin-users-confirm-title"
      className="admin-users__dialog"
      onCancel={(event) => {
        event.preventDefault();
        presenter.closeConfirm();
      }}
      ref={dialogRef}
    >
      <h2 id="admin-users-confirm-title">
        {action} akun {displayName}?
      </h2>
      <p id="admin-users-confirm-description">
        {isDeactivate
          ? "Akun ini tidak dapat masuk ke Axentra sampai diaktifkan kembali."
          : "Akun ini dapat masuk kembali setelah diaktifkan."}
      </p>
      {presenter.mutationError && <p role="alert">{presenter.mutationError}</p>}
      <div className="admin-users__dialog-actions">
        <button disabled={presenter.isPending} onClick={presenter.closeConfirm} type="button">
          Batal
        </button>
        <button
          className={isDeactivate ? "admin-users__confirm-danger" : "admin-users__confirm-active"}
          disabled={presenter.isPending}
          onClick={() => void presenter.confirmStatus()}
          type="button"
        >
          {presenter.isPending ? "Menyimpan..." : action}
        </button>
      </div>
    </dialog>
  );
}

export function AdminUsersView(): React.JSX.Element {
  const presenter = useAdminUsersPresenter();

  return (
    <section aria-label="Manajemen akun" className="admin-users">
      <p className="admin-users__subtitle">Kelola status akun Member Team dan Head of Team</p>
      {presenter.isLoading && <p role="status">Memuat daftar akun...</p>}
      {presenter.isAccessDenied && <p role="alert">Anda tidak memiliki izin untuk melihat akun.</p>}
      {presenter.isError && (
        <div role="alert">
          <p>Daftar akun gagal dimuat.</p>
          <button onClick={presenter.retry} type="button">
            Coba lagi
          </button>
        </div>
      )}
      {!presenter.isLoading && !presenter.isError && !presenter.isAccessDenied && (
        <div className="admin-users__table-container">
          {presenter.users.length === 0 ? (
            <p className="admin-users__empty">Belum ada akun.</p>
          ) : (
            <div className="admin-users__table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Peran</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {presenter.users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.name?.trim() || "Tanpa nama"}</strong>
                        <span>{user.email}</span>
                      </td>
                      <td>{user.role === "member_team" ? "Member Team" : "Head of Team"}</td>
                      <td>
                        <span className={`admin-users__status admin-users__status--${user.status}`}>
                          {user.status === "active" ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td>
                        <button
                          aria-label={`${user.status === "active" ? "Nonaktifkan" : "Aktifkan"} akun ${user.name?.trim() || user.email}`}
                          className={
                            user.status === "active"
                              ? "admin-users__deactivate"
                              : "admin-users__activate"
                          }
                          onClick={() => presenter.openConfirm(user)}
                          type="button"
                        >
                          {user.status === "active" ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="admin-users__pagination">
            <span>
              Menampilkan {presenter.first}–{presenter.last} dari {presenter.total} akun
            </span>
            <div>
              <button
                disabled={!presenter.hasPrevious}
                onClick={presenter.previousPage}
                type="button"
              >
                Sebelumnya
              </button>
              <button disabled={!presenter.hasNext} onClick={presenter.nextPage} type="button">
                Berikutnya
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog presenter={presenter} />
    </section>
  );
}
