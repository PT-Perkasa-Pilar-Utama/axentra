import type { AuthUser } from "@axentra/shared";

/**
 * Sesi aktif. Ini satu-satunya penyimpan token di Web: access token hidup di memori tab.
 * Refresh token hanya ada di cookie HttpOnly `axentra_refresh` dan tidak pernah dibaca JS.
 */
export type AuthSession = {
  user: AuthUser;
  token: string;
  rememberMe?: boolean;
};

export const AUTH_SESSION_STORAGE_KEY = "axentra_auth_session";

let inMemorySession: AuthSession | null = null;
// Naik setiap identitas sesi berganti (login, logout, sign-out paksa, pengguna lain). Disimpan di
// modul bersama sesi agar refresh yang dimulai sebelum pergantian tidak bisa memasang ulang sesi.
let sessionGeneration = 0;

export function getSessionGeneration(): number {
  return sessionGeneration;
}

export function advanceSessionGeneration(): void {
  sessionGeneration += 1;
}

function purgeWebStorage(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction
  }

  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction
  }
}

export function saveSession(session: AuthSession): void {
  // Access token wajib tetap di memori (docs/technical-specs/09-authentication.md).
  inMemorySession = session;
  purgeWebStorage();
}

export function loadSession(): AuthSession | null {
  return inMemorySession;
}

export function clearSession(): void {
  inMemorySession = null;
  purgeWebStorage();
}

export function getAuthToken(): string | null {
  return inMemorySession ? inMemorySession.token : null;
}
