import { isUnauthorizedError } from "./api-client.errors";

let authTokenGetter: (() => string | null) | null = null;
let unauthorizedHandler: (() => void) | null = null;
let sessionRefresher: (() => Promise<boolean>) | null = null;

export function setAuthTokenGetter(getter: (() => string | null) | null): void {
  authTokenGetter = getter;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

/** Dipanggil saat 401; mengembalikan true bila sesi diperbarui dan permintaan boleh diulang. */
export function setSessionRefresher(refresher: (() => Promise<boolean>) | null): void {
  sessionRefresher = refresher;
}

export function mergeRequestHeaders(input?: HeadersInit, includeAuth = true): Headers {
  const headers = new Headers(input);
  if (!headers.has("accept")) headers.set("accept", "application/json");

  if (includeAuth && !headers.has("authorization")) {
    const token = authTokenGetter ? authTokenGetter() : null;
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
  }

  return headers;
}

async function renewSession(): Promise<boolean> {
  if (!sessionRefresher) return false;
  try {
    return await sessionRefresher();
  } catch {
    return false;
  }
}

/**
 * Pada 401 dari endpoint terproteksi: refresh sesi sekali (single-flight di pemanggil),
 * lalu ulangi permintaan sekali. Bila gagal, sesi dihapus dan pengalihan dipicu.
 * Endpoint sesi (login, refresh, logout) tidak memakai jalur ini.
 */
export async function withSessionRecovery<T>(
  sessionEndpoint: boolean,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (sessionEndpoint || !isUnauthorizedError(error)) throw error;

    if (await renewSession()) {
      try {
        return await run();
      } catch (retryError) {
        if (isUnauthorizedError(retryError)) unauthorizedHandler?.();
        throw retryError;
      }
    }

    unauthorizedHandler?.();
    throw error;
  }
}
