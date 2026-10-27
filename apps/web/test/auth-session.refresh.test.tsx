import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { AuthUser, LoginResponse } from "@axentra/shared";
import { z } from "zod";
import { AuthSessionProvider, useAuthSession } from "../src/features/auth/auth-session.context";
import { clearSession, getAuthToken, type AuthSession } from "../src/features/auth/session.storage";
import { SessionBootstrapGate } from "../src/features/auth/session-loading.view";
import { UserSessionBadge } from "../src/features/auth/user-session-badge.view";
import {
  ApiClientError,
  apiRequest,
  setAuthTokenGetter,
  setSessionRefresher,
  setUnauthorizedHandler,
} from "../src/lib/api-client";

const EXPIRES_AT = "2026-10-27T12:00:00.000Z";

const memberUser: AuthUser = {
  id: "usr-001",
  email: "member@axentra.local",
  role: "member_team",
  name: "Budi Santoso",
};

const documentsSchema = z.object({ status: z.string() });

function createMockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit | undefined) => Promise<Response>,
) {
  return Object.assign(handler, {
    preconnect: (
      _url: string | URL,
      _options?: { dns?: boolean; tcp?: boolean; http?: boolean; https?: boolean } | undefined,
    ): void => {},
  });
}

function okResponse(): Response {
  return new Response(JSON.stringify({ success: true, data: { status: "ok" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code: "UNAUTHORIZED", message: "Sesi berakhir" } }),
    { status: 401, headers: { "content-type": "application/json" } },
  );
}

function refreshedResponse(token: string): LoginResponse {
  return { user: memberUser, token, expiresAt: EXPIRES_AT };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  const handlers: { resolve?: (value: T) => void; reject?: (error: unknown) => void } = {};
  const promise = new Promise<T>((resolve, reject) => {
    handlers.resolve = resolve;
    handlers.reject = reject;
  });
  return {
    promise,
    resolve: (value) => handlers.resolve?.(value),
    reject: (error) => handlers.reject?.(error),
  };
}

function hasSetUrl(value: unknown): value is { setURL: (url: string) => void } {
  return (
    typeof value === "object" &&
    value !== null &&
    "setURL" in value &&
    typeof value.setURL === "function"
  );
}

/** happy-dom tidak memperbarui location lewat history.replaceState; pakai API setURL-nya. */
function setTestLocation(url: string): void {
  if (!("happyDOM" in window) || !hasSetUrl(window.happyDOM)) {
    throw new Error("happy-dom setURL tidak tersedia");
  }
  window.happyDOM.setURL(url);
}

function SessionProbe() {
  const { isAuthenticated } = useAuthSession();
  return <div>{isAuthenticated ? "Logged In" : "Logged Out"}</div>;
}

function ContextCapture({
  onContext,
}: {
  onContext: (ctx: ReturnType<typeof useAuthSession>) => void;
}) {
  const context = useAuthSession();
  onContext(context);
  return <SessionProbe />;
}

afterEach(() => {
  cleanup();
  setAuthTokenGetter(null);
  setUnauthorizedHandler(null);
  setSessionRefresher(null);
  clearSession();
});

describe("bootstrap sesi saat app dibuka (C2)", () => {
  test("menahan UI dengan memuat sesi lalu memulihkan token di memori dari satu panggilan refresh", async () => {
    const deferred = createDeferred<LoginResponse>();
    const refresh = mock(() => deferred.promise);

    render(
      <AuthSessionProvider refreshApiFn={refresh} onUnauthorized={() => {}}>
        <SessionBootstrapGate>
          <SessionProbe />
        </SessionBootstrapGate>
      </AuthSessionProvider>,
    );

    expect(screen.getByText("Memuat sesi...")).toBeTruthy();
    expect(screen.queryByText("Logged Out")).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve(refreshedResponse("ax_restored"));
    });

    await waitFor(() => expect(screen.getByText("Logged In")).toBeTruthy());
    expect(getAuthToken()).toBe("ax_restored");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("StrictMode tetap hanya memanggil refresh sekali (single-flight)", async () => {
    const refresh = mock(async () => refreshedResponse("ax_strict"));

    render(
      <StrictMode>
        <AuthSessionProvider refreshApiFn={refresh} onUnauthorized={() => {}}>
          <SessionBootstrapGate>
            <SessionProbe />
          </SessionBootstrapGate>
        </AuthSessionProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByText("Logged In")).toBeTruthy());
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(getAuthToken()).toBe("ax_strict");
  });

  test("401 saat bootstrap diperlakukan sebagai belum login tanpa pengalihan", async () => {
    const onUnauthorized = mock(() => {});
    const refresh = mock(async (): Promise<LoginResponse> => {
      throw new ApiClientError("UNAUTHORIZED", "Sesi tidak ditemukan", 401);
    });

    render(
      <AuthSessionProvider refreshApiFn={refresh} onUnauthorized={onUnauthorized}>
        <SessionBootstrapGate>
          <SessionProbe />
        </SessionBootstrapGate>
      </AuthSessionProvider>,
    );

    await waitFor(() => expect(screen.getByText("Logged Out")).toBeTruthy());
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(getAuthToken()).toBeNull();
  });
});

describe("recovery 401 saat sesi sudah aktif (C3)", () => {
  const initialSession: AuthSession = { user: memberUser, token: "ax_old", rememberMe: true };

  test("401 bersamaan berbagi satu refresh lalu kedua permintaan diulang dengan token baru", async () => {
    const onUnauthorized = mock(() => {});
    const refresh = mock(async (): Promise<LoginResponse> => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return refreshedResponse("ax_new");
    });

    render(
      <AuthSessionProvider
        initialSession={initialSession}
        refreshApiFn={refresh}
        onUnauthorized={onUnauthorized}
      >
        <SessionProbe />
      </AuthSessionProvider>,
    );

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async (_input, init) => {
        const authorization = new Headers(init?.headers).get("authorization");
        return authorization === "Bearer ax_new" ? okResponse() : unauthorizedResponse();
      }),
    );
    try {
      const results = await act(async () =>
        Promise.all([
          apiRequest("/documents/a", documentsSchema),
          apiRequest("/documents/b", documentsSchema),
        ]),
      );
      expect(results.map((result) => result.status)).toEqual(["ok", "ok"]);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(getAuthToken()).toBe("ax_new");
      expect(onUnauthorized).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("refresh gagal: sesi dihapus dan pengalihan membawa jalur halaman saat ini", async () => {
    const originalUrl = window.location.href;
    setTestLocation("http://localhost/dashboard");
    const onUnauthorized = mock((_currentPath?: string) => {});
    const refresh = mock(async (): Promise<LoginResponse> => {
      throw new ApiClientError("UNAUTHORIZED", "Sesi berakhir", 401);
    });

    render(
      <AuthSessionProvider
        initialSession={initialSession}
        refreshApiFn={refresh}
        onUnauthorized={onUnauthorized}
      >
        <SessionProbe />
      </AuthSessionProvider>,
    );

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () => unauthorizedResponse()),
    );
    try {
      await act(async () => {
        await expect(apiRequest("/documents", documentsSchema)).rejects.toMatchObject({
          status: 401,
        });
      });
      expect(onUnauthorized).toHaveBeenCalledWith("/dashboard");
      expect(getAuthToken()).toBeNull();
      await waitFor(() => expect(screen.getByText("Logged Out")).toBeTruthy());
    } finally {
      fetchSpy.mockRestore();
      setTestLocation(originalUrl);
    }
  });

  test("halaman login tidak menimpa jalur kembali yang tersimpan", async () => {
    const originalUrl = window.location.href;
    setTestLocation("http://localhost/login");
    const onUnauthorized = mock((_currentPath?: string) => {});
    const refresh = mock(async (): Promise<LoginResponse> => {
      throw new ApiClientError("UNAUTHORIZED", "Sesi berakhir", 401);
    });

    render(
      <AuthSessionProvider
        initialSession={initialSession}
        refreshApiFn={refresh}
        onUnauthorized={onUnauthorized}
      >
        <SessionProbe />
      </AuthSessionProvider>,
    );

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () => unauthorizedResponse()),
    );
    try {
      await act(async () => {
        await expect(apiRequest("/documents", documentsSchema)).rejects.toMatchObject({
          status: 401,
        });
      });
      expect(onUnauthorized).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      setTestLocation(originalUrl);
    }
  });
});

describe("logout (C5)", () => {
  test("memanggil logout, menghapus token, lalu mengarahkan ke /login", async () => {
    const logoutApiFn = mock(async () => ({ message: "Berhasil keluar" }));
    const initialSession: AuthSession = { user: memberUser, token: "ax_logout_token" };

    render(
      <AuthSessionProvider
        initialSession={initialSession}
        logoutApiFn={logoutApiFn}
        onUnauthorized={() => {}}
      >
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/dashboard" element={<UserSessionBadge />} />
            <Route path="/login" element={<div>Halaman Login Uji</div>} />
          </Routes>
        </MemoryRouter>
      </AuthSessionProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Keluar dari akun" }));

    await waitFor(() => expect(screen.getByText("Halaman Login Uji")).toBeTruthy());
    expect(logoutApiFn).toHaveBeenCalledTimes(1);
    expect(getAuthToken()).toBeNull();
  });

  test("kegagalan endpoint logout tetap menghapus sesi lokal", async () => {
    const logoutApiFn = mock(async (): Promise<{ message: string }> => {
      throw new ApiClientError("NETWORK_ERROR", "Tidak dapat terhubung ke server", 0);
    });
    const initialSession: AuthSession = { user: memberUser, token: "ax_offline_token" };
    let captured: ReturnType<typeof useAuthSession> | undefined;
    const onContext = (ctx: ReturnType<typeof useAuthSession>) => {
      captured = ctx;
    };

    render(
      <AuthSessionProvider
        initialSession={initialSession}
        logoutApiFn={logoutApiFn}
        onUnauthorized={() => {}}
      >
        <ContextCapture onContext={onContext} />
      </AuthSessionProvider>,
    );

    expect(screen.getByText("Logged In")).toBeTruthy();
    await act(async () => {
      await captured?.logoutSession();
    });
    expect(logoutApiFn).toHaveBeenCalledTimes(1);
    expect(getAuthToken()).toBeNull();
    await waitFor(() => expect(screen.getByText("Logged Out")).toBeTruthy());
  });
});
