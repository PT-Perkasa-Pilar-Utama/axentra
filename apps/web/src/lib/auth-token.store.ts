/**
 * In-memory access token store.
 *
 * Token disimpan di module-level variable — tidak pernah menyentuh
 * localStorage, sessionStorage, atau media persisten lainnya
 * (docs/technical-specs/09-authentication.md, section 4).
 *
 * Lifetime: selama tab/window aktif. Token hilang saat halaman di-refresh,
 * yang merupakan perilaku yang diinginkan untuk keamanan.
 *
 * FE-S1-05 / FE-S1-06 memanggil setAuthToken(token) setelah login berhasil
 * dan clearAuthToken() saat logout atau sesi kadaluarsa.
 */

let _accessToken: string | null = null;

/** Simpan access token dari response login ke memory. */
export function setAuthToken(token: string): void {
  _accessToken = token;
}

/**
 * Baca token aktif. Dipanggil oleh mergeRequestHeaders setiap request.
 * Mengembalikan null jika belum login atau sudah logout.
 */
export function getAuthToken(): string | null {
  return _accessToken;
}

/** Hapus token — dipanggil saat logout atau menerima 401. */
export function clearAuthToken(): void {
  _accessToken = null;
}
