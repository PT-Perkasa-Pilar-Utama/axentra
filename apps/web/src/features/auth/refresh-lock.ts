/**
 * Serialisasi refresh sesi lintas tab (docs/api-specs/02-authentication.md, bagian refresh).
 *
 * Cookie `axentra_refresh` dipakai bersama oleh semua tab pada origin yang sama. Dua tab yang
 * mengirim refresh dengan cookie yang sama secara bersamaan membuat server mendeteksi reuse dan
 * mencabut seluruh sesi. Web Locks memastikan satu tab me-refresh pada satu waktu; tab yang
 * menunggu baru mengirim permintaannya setelah tab pertama selesai, sehingga permintaan itu
 * membawa cookie hasil rotasi dan bukan cookie lama.
 */
export const AUTH_REFRESH_LOCK_NAME = "axentra-auth-refresh";

function resolveLockManager(): LockManager | null {
  if (typeof navigator === "undefined") return null;
  // navigator.locks hanya ada di konteks aman (HTTPS atau localhost); di luar itu nilainya kosong.
  const manager: LockManager | null | undefined = navigator.locks;
  return manager ?? null;
}

/**
 * Menjalankan task secara eksklusif lintas tab dengan lock bernama (mode default: exclusive).
 * Tanpa navigator.locks, task tetap berjalan tanpa koordinasi antartab: browser hanya menyediakan
 * Web Locks di konteks aman (HTTPS atau localhost), sehingga di luar itu tab lain tidak bisa
 * diketahui. Hanya single-flight di dalam satu tab yang berlaku, dan tab lain yang me-refresh
 * bersamaan masih dapat memakai cookie yang sudah dirotasi.
 */
export async function runWithRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = resolveLockManager();
  if (locks === null) return task();
  return locks.request(AUTH_REFRESH_LOCK_NAME, task);
}
