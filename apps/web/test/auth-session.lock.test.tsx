import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { z } from "zod";
import {
  AuthSessionProvider,
  useAuthSession,
  type AuthSessionContextValue,
} from "../src/features/auth/auth-session.context";
import { AUTH_REFRESH_LOCK_NAME } from "../src/features/auth/refresh-lock";
import { SessionBootstrapGate } from "../src/features/auth/session-bootstrap-gate.view";
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
  fetchAcceptingToken,
  installNavigatorLocks,
  loginResponseFor,
  memberUser,
} from "./auth-test-support";

const documentsSchema = z.object({ status: z.string() });
const staleSession: AuthSession = { user: memberUser, token: "ax_stale", rememberMe: true };

type SessionProbeProps = {
  capture?: (context: AuthSessionContextValue) => void;
};

function SessionProbe({ capture }: SessionProbeProps): React.JSX.Element {
  const context = useAuthSession();
  capture?.(context);
  return <div>{context.isAuthenticated ? "Logged In" : "Logged Out"}</div>;
}

let restoreLocks: (() => void) | null = null;

function useNavigatorLocks(value: Parameters<typeof installNavigatorLocks>[0]): void {
  restoreLocks = installNavigatorLocks(value);
}

afterEach(() => {
  cleanup();
  restoreLocks?.();
  restoreLocks = null;
  setAuthTokenGetter(null);
  setUnauthorizedHandler(null);
  setSessionRefresher(null);
  clearSession();
});

describe("refresh lintas tab dengan Web Locks (F9)", () => {
  test("bootstrap menjalankan refresh di dalam lock bernama", async () => {
    const locks = createFakeLockManager();
    useNavigatorLocks(locks);
    const lockCountDuringRefresh: number[] = [];
    const refresh = mock(async () => {
      lockCountDuringRefresh.push(locks.running());
      return loginResponseFor("ax_restored");
    });

    render(
      <AuthSessionProvider refreshApiFn={refresh} onUnauthorized={() => {}}>
        <SessionBootstrapGate>
          <SessionProbe />
        </SessionBootstrapGate>
      </AuthSessionProvider>,
    );

    await waitFor(() => expect(screen.getByText("Logged In")).toBeTruthy());
    expect(locks.requests).toEqual([AUTH_REFRESH_LOCK_NAME]);
    expect(lockCountDuringRefresh).toEqual([1]);
    expect(getAuthToken()).toBe("ax_restored");
  });

  test("refresh yang menunggu tab lain baru dikirim setelah tab itu melepas lock", async () => {
    const locks = createFakeLockManager();
    useNavigatorLocks(locks);
    const refresh = mock(async () => loginResponseFor("ax_refreshed"));
    render(
      <AuthSessionProvider
        initialSession={staleSession}
        refreshApiFn={refresh}
        onUnauthorized={() => {}}
      >
        <SessionProbe />
      </AuthSessionProvider>,
    );
    const otherTabGate = createDeferred<void>();
    const otherTabHoldsLock = locks.request(AUTH_REFRESH_LOCK_NAME, () => otherTabGate.promise);
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      fetchAcceptingToken("ax_refreshed"),
    );

    try {
      const pending = apiRequest("/documents/a", documentsSchema);
      await waitFor(() => expect(locks.requests).toHaveLength(2));
      expect(refresh).not.toHaveBeenCalled();

      await act(async () => {
        otherTabGate.resolve();
        await otherTabHoldsLock;
        await expect(pending).resolves.toEqual({ status: "ok" });
      });

      expect(refresh).toHaveBeenCalledTimes(1);
      expect(getAuthToken()).toBe("ax_refreshed");
      expect(locks.peakRunning()).toBe(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("tab yang menunggu tidak me-refresh lagi bila sesinya berganti selama menunggu lock", async () => {
    const locks = createFakeLockManager();
    useNavigatorLocks(locks);
    const refresh = mock(async () => loginResponseFor("ax_dari_refresh"));
    const captured: { current: AuthSessionContextValue | null } = { current: null };
    render(
      <AuthSessionProvider
        initialSession={staleSession}
        refreshApiFn={refresh}
        onUnauthorized={() => {}}
      >
        <SessionProbe
          capture={(context) => {
            captured.current = context;
          }}
        />
      </AuthSessionProvider>,
    );
    const otherTabGate = createDeferred<void>();
    const otherTabHoldsLock = locks.request(AUTH_REFRESH_LOCK_NAME, () => otherTabGate.promise);
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      fetchAcceptingToken("ax_login_baru"),
    );

    try {
      const pending = apiRequest("/documents/a", documentsSchema);
      await waitFor(() => expect(locks.requests).toHaveLength(2));

      act(() => {
        captured.current?.loginSession(loginResponseFor("ax_login_baru"), true);
      });
      await act(async () => {
        otherTabGate.resolve();
        await otherTabHoldsLock;
        await expect(pending).resolves.toEqual({ status: "ok" });
      });

      expect(refresh).not.toHaveBeenCalled();
      expect(getAuthToken()).toBe("ax_login_baru");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("401 bersamaan di satu tab memakai satu permintaan lock dan satu refresh", async () => {
    const locks = createFakeLockManager();
    useNavigatorLocks(locks);
    const refresh = mock(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return loginResponseFor("ax_refreshed");
    });
    render(
      <AuthSessionProvider
        initialSession={staleSession}
        refreshApiFn={refresh}
        onUnauthorized={() => {}}
      >
        <SessionProbe />
      </AuthSessionProvider>,
    );
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      fetchAcceptingToken("ax_refreshed"),
    );

    try {
      const results = await act(async () =>
        Promise.all([
          apiRequest("/documents/a", documentsSchema),
          apiRequest("/documents/b", documentsSchema),
        ]),
      );

      expect(results).toEqual([{ status: "ok" }, { status: "ok" }]);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(locks.requests).toEqual([AUTH_REFRESH_LOCK_NAME]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  describe.each([
    ["null (happy-dom dan konteks tanpa Web Locks)", null],
    ["undefined (konteks tidak aman)", undefined],
  ] as const)("tanpa navigator.locks: %s", (_label, locksValue) => {
    test("kembali ke single-flight di dalam tab: 401 bersamaan berbagi satu refresh", async () => {
      useNavigatorLocks(locksValue);
      const refresh = mock(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return loginResponseFor("ax_refreshed");
      });
      render(
        <AuthSessionProvider
          initialSession={staleSession}
          refreshApiFn={refresh}
          onUnauthorized={() => {}}
        >
          <SessionProbe />
        </AuthSessionProvider>,
      );
      const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
        fetchAcceptingToken("ax_refreshed"),
      );

      try {
        const results = await act(async () =>
          Promise.all([
            apiRequest("/documents/a", documentsSchema),
            apiRequest("/documents/b", documentsSchema),
          ]),
        );

        expect(results).toEqual([{ status: "ok" }, { status: "ok" }]);
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(getAuthToken()).toBe("ax_refreshed");
      } finally {
        fetchSpy.mockRestore();
      }
    });

    test("bootstrap tetap memulihkan sesi", async () => {
      useNavigatorLocks(locksValue);
      const refresh = mock(async () => loginResponseFor("ax_restored"));

      render(
        <AuthSessionProvider refreshApiFn={refresh} onUnauthorized={() => {}}>
          <SessionBootstrapGate>
            <SessionProbe />
          </SessionBootstrapGate>
        </AuthSessionProvider>,
      );

      await waitFor(() => expect(screen.getByText("Logged In")).toBeTruthy());
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });
});
