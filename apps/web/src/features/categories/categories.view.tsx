import type React from "react";
import type { CategoriesPresenter } from "./categories.presenter";

export type CategoryNavigationViewProps = {
  presenter: CategoriesPresenter;
};

export function CategoryNavigationView({
  presenter,
}: CategoryNavigationViewProps): React.JSX.Element {
  return (
    <section className="category-navigation" aria-label="Kategori">
      <h2>Kategori</h2>
      {presenter.isLoading && <p role="status">Memuat kategori...</p>}
      {presenter.isError && (
        <div role="alert">
          <p>Kategori gagal dimuat.</p>
          <button type="button" onClick={presenter.retry}>
            Coba lagi
          </button>
        </div>
      )}
      {presenter.isEmpty && !presenter.isLoading && <p>Belum ada kategori.</p>}
      {!presenter.isLoading && !presenter.isError && presenter.categories.length > 0 && (
        <ul aria-label="Daftar kategori">
          {presenter.categories.map((category) => (
            <li key={category.id}>
              <button
                type="button"
                aria-pressed={presenter.selectedCategoryId === category.id}
                onClick={() => presenter.selectCategory(category.id)}
              >
                {category.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {presenter.selectedCategoryId && (
        <button type="button" onClick={presenter.clearCategory}>
          Hapus filter kategori
        </button>
      )}
    </section>
  );
}
