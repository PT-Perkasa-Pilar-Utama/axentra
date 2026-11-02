import type React from "react";
import {
  usePermissionCategoriesPresenter,
  type PermissionCategoriesPresenter,
} from "./permission-categories.presenter";
import "./permission-categories.css";

export type PermissionCategoriesViewProps = {
  presenter?: PermissionCategoriesPresenter;
};

export function PermissionCategoriesView({
  presenter: presenterProp,
}: PermissionCategoriesViewProps = {}): React.JSX.Element {
  const defaultPresenter = usePermissionCategoriesPresenter();
  const presenter = presenterProp ?? defaultPresenter;

  return (
    <>
      <title>Permission Category | Axentra</title>
      <div className="permission-categories-content" data-testid="permission-categories-page">
        <header className="permission-categories__header">
          <h1>Permission Category</h1>
        </header>

        {presenter.toggleError && (
          <div className="permission-categories__alert" role="alert">
            <span>{presenter.toggleError}</span>
            <button
              className="permission-categories__alert-close"
              onClick={presenter.clearToggleError}
              type="button"
            >
              Tutup
            </button>
          </div>
        )}

        {presenter.isLoading && (
          <div aria-busy="true" className="permission-categories__skeleton-list" role="status">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                className="permission-categories__skeleton motion-safe:animate-pulse"
                key={`skeleton-${index}`}
              />
            ))}
            <span className="sr-only">Memuat daftar kategori...</span>
          </div>
        )}

        {presenter.isAccessDenied && (
          <div className="permission-categories__state" role="alert">
            <h2>Akses Dibatasi</h2>
            <p>Anda tidak memiliki izin untuk mengatur izin unduh kategori.</p>
          </div>
        )}

        {presenter.isError && !presenter.isAccessDenied && (
          <div className="permission-categories__state" role="alert">
            <p>Daftar kategori gagal dimuat.</p>
            <button
              className="permission-categories__retry-button"
              onClick={() => void presenter.retry()}
              type="button"
            >
              Coba lagi
            </button>
          </div>
        )}

        {presenter.isEmpty && (
          <div className="permission-categories__state">
            <p>Belum ada kategori dokumen.</p>
          </div>
        )}

        {!presenter.isLoading && !presenter.isError && !presenter.isEmpty && (
          <ul aria-label="Daftar izin kategori dokumen" className="permission-categories__list">
            {presenter.categories.map((category) => (
              <li className="permission-category-card" key={category.id}>
                <span className="permission-category-card__name">{category.name}</span>
                <button
                  aria-checked={category.downloadEnabled}
                  aria-label={`Izin unduh kategori ${category.name}`}
                  className={`permission-category-switch ${
                    category.downloadEnabled ? "is-active" : ""
                  }`}
                  disabled={presenter.pendingCategoryId === category.id}
                  onClick={() =>
                    void presenter.togglePermission(category.id, !category.downloadEnabled)
                  }
                  role="switch"
                  type="button"
                >
                  <span aria-hidden="true" className="permission-category-switch__thumb" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
