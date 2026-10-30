import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { LoginResponse } from "@axentra/shared";
import { z } from "zod";
import {
  AuthSessionProvider,
  useAuthSession,
  type AuthSessionContextValue,
} from "../src/features/auth/auth-session.context";
import { AUTH_REFRESH_LOCK_NAME } from "../src/features/auth/refresh-lock";
import { clearSession, getAuthToken, type AuthSession } from "../src/features/auth/session.storage";
import {
  apiRequest,
  setAuthTokenGetter,
  setSessionRefresher,
  setUnauthorizedHandler,
} from "../src/lib/api-client";
import {
  createDeferred,
  createFakeLockManager,
  createMockFetch,
  installNavigatorLocks,
  loginResponseFor,
  memberUser,
  unauthorizedResponse,
} from "./auth-test-support";

const documentsSchema = z.object({ status: z.string() });
const staleSession: AuthSession = { user: memberUser, token: "ax_stale", rememberMe: true };

type ContextCaptureProps = {
  capture: (context: AuthSessionContextValue) => void;
};

// Berada di luar SessionBootstrapGate agar logout bisa dipanggil saat bootstrap masih berjalan.
function ContextCapture({ capture }: ContextCaptureProps): React.JSX.Element {
  const context = useAuthSession();
  capture(context);
  return <div>{context.isAuthenticated ? "Logged In" : "Logged Out"}</div>;
}

// Menangkap galat sebagai nilai agar gerbang refresh tidak menahan thread tes.
async function captureRejection(pending: Promise<unknown>): Promise<unknown> {
  try {
    await pending;
  } catch (error) {
    return error;
  }
  throw new Error("permintaan seharusnya ditolak");
}

let restoreLocks: (() => void) | null = null;

afterEach(() => {
  cleanup();
  restoreLocks?.();
  restoreLocks = null;
  setAuthTokenGetter(null);
  setUnauthorizedHandler(null);
  setSessionRefresher(null);
  clearSession();
});

describe("logout dan refresh yang sedang berjalan (F9, F10)", () => {
  test("tanpa navigator.locks: refresh bootstrap yang selesai setelah logout tidak memasang sesi", async () => {
    restoreLocks = installNavigatorLocks(null);
    const refreshGate = createDeferred<LoginResponse>();
    const refresh = mock(() => refreshGate.promise);
    const logoutApiFn = mock(async () => ({ message: "Logout berhasil" }));
    const captured: { current: AuthSessionContextValue | null } = { current: null };
    render(
      <AuthSessionProvider
        refreshApiFn={refresh}
        logoutApiFn={logoutApiFn}
        onUnauthorized={() => {}}
      >
        <ContextCapture
          capture={(context) => {
            captured.current = context;
          }}
        />
      </AuthSessionProvider>,
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    await act(async () => {
      expect(await captured.current?.logoutSession()).toBe(true);
    });
    await act(async () => {
      refreshGate.resolve(loginResponseFor("ax_terlambat"));
    });

    await waitFor(() => expect(captured.current?.isLoading).toBe(false));
    expect(logoutApiFn).toHaveBeenCalledTimes(1);
    expect(getAuthToken()).toBeNull();
    expect(captured.current?.isAuthenticated).toBe(false);
  });

  test("dengan navigator.locks: logout menunggu refresh yang sedang berjalan selesai lebih dulu", async () => {
    const locks = createFakeLockManager();
    restoreLocks = installNavigatorLocks(locks);
    const refreshGate = createDeferred<LoginResponse>();
    const refresh = mock(() => refreshGate.promise);
    const logoutApiFn = mock(async () => ({ message: "Logout berhasil" }));
    const captured: { current: AuthSessionContextValue | null } = { current: null };
    render(
      <AuthSessionProvider
        refreshApiFn={refresh}
        logoutApiFn={logoutApiFn}
        onUnauthorized={() => {}}
      >
        <ContextCapture
          capture={(context) => {
            captured.current = context;
          }}
        />
      </AuthSessionProvider>,
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    let logoutResult: Promise<boolean> | undefined;
    act(() => {
      logoutResult = captured.current?.logoutSession();
    });
    await waitFor(() =>
      expect(locks.requests).toEqual([AUTH_REFRESH_LOCK_NAME, AUTH_REFRESH_LOCK_NAME]),
    );
    expect(logoutApiFn).not.toHaveBeenCalled();

    await act(async () => {
      refreshGate.resolve(loginResponseFor("ax_bootstrap"));
      expect(await logoutResult).toBe(true);
    });

    expect(logoutApiFn).toHaveBeenCalledTimes(1);
    expect(getAuthToken()).toBeNull();
    expect(captured.current?.isAuthenticated).toBe(false);
    expect(locks.peakRunning()).toBe(1);
  });

  test("dengan navigator.locks: refresh yang mengantre di belakang logout dibuang setelah sesi berganti", async () => {
    const locks = createFakeLockManager();
    restoreLocks = installNavigatorLocks(locks);
    const refresh = mock(async () => loginResponseFor("ax_tidak_boleh"));
    const logoutGate = createDeferred<{ message: string }>();
    const logoutApiFn = mock(() => logoutGate.promise);
    const captured: { current: AuthSessionContextValue | null } = { current: null };
    render(
      <AuthSessionProvider
        initialSession={staleSession}
        refreshApiFn={refresh}
        logoutApiFn={logoutApiFn}
        onUnauthorized={() => {}}
      >
        <ContextCapture
          capture={(context) => {
            captured.current = context;
          }}
        />
      </AuthSessionProvider>,
    );
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () => unauthorizedResponse()),
    );

    try {
      let logoutResult: Promise<boolean> | undefined;
      act(() => {
        logoutResult = captured.current?.logoutSession();
      });
      // 401 yang tiba saat logout masih berjalan mencoba refresh, tetapi harus menunggu lock.
      const pending = captureRejection(apiRequest("/documents/a", documentsSchema));
      await waitFor(() => expect(locks.requests).toHaveLength(2));
      expect(refresh).not.toHaveBeenCalled();

      await act(async () => {
        logoutGate.resolve({ message: "Logout berhasil" });
        expect(await logoutResult).toBe(true);
      });

      expect(await pending).toMatchObject({ status: 401 });
      expect(refresh).not.toHaveBeenCalled();
      expect(getAuthToken()).toBeNull();
      expect(captured.current?.isAuthenticated).toBe(false);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
