/** Jumlah halaman; minimal 1 agar indikator "Halaman 1 dari 1" tetap tampil saat daftar kosong. */
export function totalPagesFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Membatasi nomor halaman ke rentang [1, totalPages]. */
export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), totalPages);
}
