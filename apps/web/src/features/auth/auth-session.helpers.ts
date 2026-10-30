import type { LoginResponse } from "@axentra/shared";
import { clearSession, loadSession, type AuthSession } from "./session.storage";

export const LOGIN_PATH = "/login";

/** Hasil satu siklus refresh: dilewati bila sesi berubah selama menunggu lock lintas tab. */
export type RefreshResult = { skipped: true } | { skipped: false; response: LoginResponse };

export function toAuthSession(
  response: LoginResponse,
  rememberMe: boolean | undefined,
): AuthSession {
  const session: AuthSession = { user: response.user, token: response.token };
  return rememberMe === undefined ? session : { ...session, rememberMe };
}

/** Memulihkan sesi dari cookie saat app dibuka; galat apa pun berarti belum ada sesi. */
export async function restoreSession(
  refresh: () => Promise<RefreshResult>,
): Promise<AuthSession | null> {
  try {
    const result = await refresh();
    return result.skipped ? loadSession() : toAuthSession(result.response, undefined);
  } catch {
    // 401 (tidak ada sesi) atau kegagalan jaringan: anggap belum login.
    return null;
  }
}

/**
 * Jalur sign-out paksa: server menyatakan sesi tidak berlaku (401 yang tidak pulih lewat refresh).
 * Sesi lokal dihapus lalu pengguna dialihkan ke /login. Kegagalan logout sukarela bukan jalur ini.
 */
export function createUnauthorizedHandler(
  onUnauthorized?: (currentPath?: string) => void,
): () => void {
  return () => {
    clearSession();
    if (typeof window === "undefined") return;

    // Sudah di halaman login: tujuan kembali yang tersimpan tidak boleh ditimpa.
    if (window.location.pathname === LOGIN_PATH) return;

    const currentPath = window.location.pathname + window.location.search;
    if (onUnauthorized) {
      onUnauthorized(currentPath);
      return;
    }

    const target = `${LOGIN_PATH}?from=${encodeURIComponent(currentPath)}`;
    if (window.location.assign) {
      window.location.assign(target);
    } else {
      window.location.href = target;
    }
  };
}
