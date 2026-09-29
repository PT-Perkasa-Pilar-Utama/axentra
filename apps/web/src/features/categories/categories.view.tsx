import type React from "react";

// ponytail: FE-S2-03 is UI-only; connect approved category/filter APIs after BE-S2-04/BE-S2-05.
export function CategoryNavigationView(): React.JSX.Element {
  return (
    <section className="category-navigation" aria-labelledby="category-navigation-title">
      <h2 id="category-navigation-title">Kategori</h2>
      <p className="category-navigation-status">Kategori belum tersedia</p>
      <p className="category-navigation-description">
        Navigasi kategori belum aktif. Untuk sementara, gunakan daftar dokumen terbaru di dasbor.
      </p>
    </section>
  );
}
