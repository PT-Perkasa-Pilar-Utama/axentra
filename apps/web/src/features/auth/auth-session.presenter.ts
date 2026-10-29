import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import type { AuthUser, LoginResponse } from "@axentra/shared";
import {
  setAuthTokenGetter,
  setSessionRefresher,
  setUnauthorizedHandler,
} from "../../lib/api-client";
import {
  createUnauthorizedHandler,
  restoreSession,
  toAuthSession,
  type RefreshResult,
} from "./auth-session.helpers";
import { runSharedRefresh, type RefreshInFlight } from "./auth-session.refresh";
import {
  logout as defaultLogoutApi,
  refreshSession as defaultRefreshApi,
  type LogoutResponse,
} from "./login.api";
import { runWithRefreshLock } from "./refresh-lock";
import {
  advanceSessionGeneration,
  clearSession,
  getAuthToken,
  getSessionGeneration,
  loadSession,
  saveSession,
  type AuthSession,
} from "./session.storage";

export type AuthSessionPresenter = {
  session: AuthSession | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** true selama bootstrap sesi (POST /auth/refresh) berjalan; halaman terproteksi menunggu. */
  isLoading: boolean;
  loginSession: (response: LoginResponse, rememberMe: boolean) => void;
  /**
   * true setelah server mengonfirmasi logout dan sesi lokal dihapus. false bila permintaan logout
   * gagal: sesi di server mungkin masih aktif, jadi sesi lokal dipertahankan agar bisa dicoba lagi.
   */
  logoutSession: () => Promise<boolean>;
};

export type AuthSessionPresenterOptions = {
  initialSession?: AuthSession | null;
  logoutApiFn?: () => Promise<LogoutResponse>;
  refreshApiFn?: () => Promise<LoginResponse>;
  onUnauthorized?: (currentPath?: string) => void;
};

/**
 * Sesi lokal hanya dihapus lewat dua jalur:
 * 1. Logout terkonfirmasi: POST /auth/logout dibalas sukses (logoutSession).
 * 2. Sign-out paksa: server menyatakan sesi tidak berlaku, yaitu 401 yang tidak pulih lewat refresh
 *    (handleUnauthorized), atau bootstrap yang tidak menemukan sesi.
 * Kegagalan jaringan atau 5xx saat logout bukan salah satunya. Kedua jalur, serta login, memakai
 * replaceSession: generasi sesi naik dan cache query dikosongkan agar data pengguna sebelumnya
 * tidak tampil pada sesi berikutnya.
 */
export function useAuthSessionPresenter({
  initialSession,
  logoutApiFn = defaultLogoutApi,
  refreshApiFn = defaultRefreshApi,
  onUnauthorized,
}: AuthSessionPresenterOptions): AuthSessionPresenter {
  // Provider selalu berada di dalam QueryClientProvider (main.tsx). Tanpa client tidak ada cache
  // yang perlu dikosongkan, mis. pada tes yang hanya menguji sesi.
  const queryClient = useContext(QueryClientContext);
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
  const refreshInFlight = useRef<RefreshInFlight | null>(null);

  useEffect(() => {
    refreshApiRef.current = refreshApiFn;
  }, [refreshApiFn]);

  const replaceSession = useCallback(
    (next: AuthSession | null): void => {
      advanceSessionGeneration();
      queryClient?.clear();
      if (next === null) {
        clearSession();
      } else {
        saveSession(next);
      }
      setSession(next);
    },
    [queryClient],
  );

  // Satu refresh dibagi oleh bootstrap dan jalur 401 yang bersamaan di tab ini (single-flight),
  // dan diserialkan lintas tab dengan lock bernama karena cookie refresh dipakai bersama.
  // Refresh yang berjalan hanya dibagi selama generasi sesinya belum berganti.
  const refreshOnce = useCallback((): Promise<RefreshResult> => {
    const generation = getSessionGeneration();
    const current = refreshInFlight.current;
    if (current !== null && current.generation === generation) return current.promise;

    const entry: RefreshInFlight = {
      generation,
      promise: runSharedRefresh(
        generation,
        getAuthToken(),
        () => refreshApiRef.current(),
        () => {
          if (refreshInFlight.current === entry) refreshInFlight.current = null;
        },
      ),
    };
    refreshInFlight.current = entry;
    return entry.promise;
  }, []);

  useEffect(() => {
    if (initialSession !== undefined) return;

    let active = true;
    // Bootstrap yang dimulai sebelum sesi berganti (logout atau login) tidak boleh memasang hasilnya,
    // karena sesi yang lebih baru sudah menggantikan sesi yang dipulihkan ini.
    const generation = getSessionGeneration();
    void (async (): Promise<void> => {
      const restored = await restoreSession(refreshOnce);
      if (!active) return;
      if (getSessionGeneration() !== generation) {
        setIsLoading(false);
        return;
      }
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
    replaceSession(null);
    createUnauthorizedHandler(onUnauthorized)();
  }, [onUnauthorized, replaceSession]);

  const renewSession = useCallback(async (): Promise<boolean> => {
    // Refresh memperpanjang sesi yang ada. Sesi baru hanya lahir dari login atau bootstrap, jadi
    // 401 yang tiba setelah sign-out tidak boleh menghidupkan sesi lagi.
    if (loadSession() === null) return false;

    const generation = getSessionGeneration();
    try {
      const result = await refreshOnce();
      if (result.skipped || getSessionGeneration() !== generation) {
        // Sesi berganti selama refresh menunggu atau berjalan (guard generasi): hasilnya milik sesi
        // lama dan dibuang. Permintaan hanya diulang bila masih ada sesi aktif.
        return loadSession() !== null;
      }
      const previous = loadSession();
      const renewed = toAuthSession(result.response, previous?.rememberMe);
      if (previous !== null && previous.user.id !== renewed.user.id) {
        // Cookie refresh dipakai semua tab: login pengguna lain di tab lain mengganti identitas di
        // sini juga. Perlakukan sebagai pergantian sesi agar cache pengguna lama dibuang.
        replaceSession(renewed);
      } else {
        saveSession(renewed);
        setSession(renewed);
      }
      return true;
    } catch {
      return false;
    }
  }, [refreshOnce, replaceSession]);

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

  const loginSession = useCallback(
    (response: LoginResponse, rememberMe: boolean): void => {
      replaceSession(toAuthSession(response, rememberMe));
    },
    [replaceSession],
  );

  // Logout memakai lock yang sama dengan refresh. Refresh yang sedang berjalan selesai lebih dulu,
  // sehingga server mencabut cookie hasil rotasi terbaru. Sesi diganti di dalam lock agar refresh
  // yang mengantre di belakangnya melihat generasi baru dan dibuang.
  const logoutSession = useCallback(
    (): Promise<boolean> =>
      runWithRefreshLock(async (): Promise<boolean> => {
        try {
          await logoutApiFn();
        } catch {
          // Server belum mengonfirmasi logout, jadi sesi di server mungkin masih aktif. Sesi lokal
          // dipertahankan dan pemanggil menampilkan galat dengan aksi coba lagi.
          return false;
        }
        replaceSession(null);
        return true;
      }),
    [logoutApiFn, replaceSession],
  );

  return {
    session,
    user: session ? session.user : null,
    isAuthenticated: Boolean(session?.token),
    isLoading,
    loginSession,
    logoutSession,
  };
}
