import type React from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { AuthUser, LoginResponse } from "@axentra/shared";
import {
  setAuthTokenGetter,
  setSessionRefresher,
  setUnauthorizedHandler,
} from "../../lib/api-client";
import {
  clearSession,
  getAuthToken,
  loadSession,
  saveSession,
  type AuthSession,
} from "./session.storage";
import {
  logout as defaultLogoutApi,
  refreshSession as defaultRefreshApi,
  type LogoutResponse,
} from "./login.api";

export const LOGIN_PATH = "/login";

export type AuthSessionContextValue = {
  session: AuthSession | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** true selama bootstrap sesi (POST /auth/refresh) berjalan; halaman terproteksi menunggu. */
  isLoading: boolean;
  loginSession: (response: LoginResponse, rememberMe: boolean) => void;
  logoutSession: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

function toAuthSession(response: LoginResponse, rememberMe: boolean | undefined): AuthSession {
  const session: AuthSession = { user: response.user, token: response.token };
  return rememberMe === undefined ? session : { ...session, rememberMe };
}

async function fetchRestoredSession(
  refresh: () => Promise<LoginResponse>,
): Promise<AuthSession | null> {
  try {
    return toAuthSession(await refresh(), undefined);
  } catch {
    // 401 (tidak ada sesi) atau kegagalan jaringan: anggap belum login.
    return null;
  }
}

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

export type AuthSessionProviderProps = {
  children?: React.ReactNode;
  initialSession?: AuthSession | null;
  logoutApiFn?: () => Promise<LogoutResponse>;
  refreshApiFn?: () => Promise<LoginResponse>;
  onUnauthorized?: (currentPath?: string) => void;
};

export function AuthSessionProvider({
  children,
  initialSession,
  logoutApiFn = defaultLogoutApi,
  refreshApiFn = defaultRefreshApi,
  onUnauthorized,
}: AuthSessionProviderProps): React.JSX.Element {
  const [session, setSession] = useState<AuthSession | null>(() => {
    if (initialSession !== undefined) {
      if (initialSession) {
        saveSession(initialSession);
      } else {
        clearSession();
      }
      return initialSession;
    }
    return loadSession();
  });
  // Tanpa initialSession, sesi dipulihkan dari cookie lewat POST /auth/refresh saat mount.
  const [isLoading, setIsLoading] = useState<boolean>(() => initialSession === undefined);
  const refreshApiRef = useRef(refreshApiFn);
  const refreshInFlight = useRef<Promise<LoginResponse> | null>(null);

  useEffect(() => {
    refreshApiRef.current = refreshApiFn;
  }, [refreshApiFn]);

  // Satu permintaan refresh dibagi oleh bootstrap dan jalur 401 yang bersamaan (single-flight).
  const refreshOnce = useCallback(async (): Promise<LoginResponse> => {
    const pending = refreshInFlight.current ?? refreshApiRef.current();
    refreshInFlight.current = pending;
    try {
      return await pending;
    } finally {
      if (refreshInFlight.current === pending) {
        refreshInFlight.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (initialSession !== undefined) return;

    let active = true;
    void (async (): Promise<void> => {
      const restored = await fetchRestoredSession(refreshOnce);
      if (!active) return;
      if (restored) {
        saveSession(restored);
      } else {
        clearSession();
      }
      setSession(restored);
      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [initialSession, refreshOnce]);

  const handleUnauthorized = useCallback((): void => {
    setSession(null);
    createUnauthorizedHandler(onUnauthorized)();
  }, [onUnauthorized]);

  const renewSession = useCallback(async (): Promise<boolean> => {
    try {
      const response = await refreshOnce();
      const renewed = toAuthSession(response, loadSession()?.rememberMe);
      saveSession(renewed);
      setSession(renewed);
      return true;
    } catch {
      return false;
    }
  }, [refreshOnce]);

  // Token getter dan unauthorized handler didaftarkan saat render agar tersedia sebelum effect
  // (mis. renderToString). Refresher hanya didaftarkan di effect karena membaca ref. Effect
  // juga mendaftarkan ulang karena StrictMode menjalankan cleanup effect sekali saat mount.
  setAuthTokenGetter(getAuthToken);
  setUnauthorizedHandler(handleUnauthorized);

  useEffect(() => {
    setAuthTokenGetter(getAuthToken);
    setUnauthorizedHandler(handleUnauthorized);
    setSessionRefresher(renewSession);
    return () => {
      setAuthTokenGetter(null);
      setUnauthorizedHandler(null);
      setSessionRefresher(null);
    };
  }, [handleUnauthorized, renewSession]);

  const loginSession = useCallback((response: LoginResponse, rememberMe: boolean): void => {
    const next = toAuthSession(response, rememberMe);
    saveSession(next);
    setSession(next);
  }, []);

  const logoutSession = useCallback(async (): Promise<void> => {
    try {
      await logoutApiFn();
    } catch {
      // Sesi lokal tetap dihapus walaupun permintaan logout gagal.
    } finally {
      clearSession();
      setSession(null);
    }
  }, [logoutApiFn]);

  const value: AuthSessionContextValue = {
    session,
    user: session ? session.user : null,
    isAuthenticated: Boolean(session?.token),
    isLoading,
    loginSession,
    logoutSession,
  };

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useOptionalAuthSession(): AuthSessionContextValue | null {
  return useContext(AuthSessionContext);
}

export function useAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error("useAuthSession must be used within an AuthSessionProvider");
  }
  return context;
}
