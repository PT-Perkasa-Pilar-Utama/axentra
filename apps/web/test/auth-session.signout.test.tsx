import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import type { LoginResponse } from "@axentra/shared";
import { z } from "zod";
import {
  AuthSessionProvider,
  useAuthSession,
  type AuthSessionContextValue,
} from "../src/features/auth/auth-session.context";
import { clearSession, getAuthToken, type AuthSession } from "../src/features/auth/session.storage";
import { LOGOUT_FAILED_MESSAGE } from "../src/features/auth/user-session-badge.presenter";
import { UserSessionBadge } from "../src/features/auth/user-session-badge.view";
import {
  ApiClientError,
  apiRequest,
  setAuthTokenGetter,
  setSessionRefresher,
  setUnauthorizedHandler,
} from "../src/lib/api-client";
import {
  createDeferred,
  createMockFetch,
  fetchAcceptingToken,
  loginResponseFor,
  memberUser,
  otherUser,
  unauthorizedResponse,
} from "./auth-test-support";

const documentsSchema = z.object({ status: z.string() });
const activeSession: AuthSession = { user: memberUser, token: "ax_active", rememberMe: true };
const DETAIL_KEY = ["document-detail", "doc-1"] as const;

type SessionProbeProps = {
  capture?: (context: AuthSessionContextValue) => void;
};

function SessionProbe({ capture }: SessionProbeProps): React.JSX.Element {
  const context = useAuthSession();
  capture?.(context);
  return <div>{context.isAuthenticated ? "Logged In" : "Logged Out"}</div>;
}

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

// Menangkap galat sebagai nilai. expect(...).rejects yang belum selesai menahan thread tes sampai
// gerbang refresh dibuka, sehingga tes macet; pemeriksaan dilakukan setelah gerbang dibuka.
async function captureRejection(pending: Promise<unknown>): Promise<unknown> {
  try {
    await pending;
  } catch (error) {
    return error;
  }
  throw new Error("permintaan seharusnya ditolak");
}

// Data dokumen milik pengguna sebelumnya, termasuk izin unduh, yang tidak boleh tampil pada sesi berikutnya.
function seedPreviousUserCache(queryClient: QueryClient): void {
  queryClient.setQueryData(DETAIL_KEY, { id: "doc-1", canDownload: true });
}

function cachedQueryCount(queryClient: QueryClient): number {
  return queryClient.getQueryCache().getAll().length;
}

function renderSession(
  queryClient: QueryClient,
  options: Partial<React.ComponentProps<typeof AuthSessionProvider>>,
  capture?: (context: AuthSessionContextValue) => void,
): void {
  render(
    <QueryClientProvider client={queryClient}>
      <AuthSessionProvider initialSession={activeSession} onUnauthorized={() => {}} {...options}>
        <SessionProbe {...(capture ? { capture } : {})} />
      </AuthSessionProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  setAuthTokenGetter(null);
  setUnauthorizedHandler(null);
  setSessionRefresher(null);
  clearSession();
});

describe("logout yang gagal tidak dianggap berhasil (F10a)", () => {
  test("logoutSession bernilai false dan sesi lokal dipertahankan saat permintaan logout gagal", async () => {
    const logoutApiFn = mock(async (): Promise<{ message: string }> => {
      throw new ApiClientError("NETWORK_ERROR", "Tidak dapat terhubung ke server", 0);
    });
    const captured: { current: AuthSessionContextValue | null } = { current: null };
    renderSession(newQueryClient(), { logoutApiFn }, (context) => {
      captured.current = context;
    });
    let confirmed: boolean | undefined;

    await act(async () => {
      confirmed = await captured.current?.logoutSession();
    });

    expect(confirmed).toBe(false);
    expect(logoutApiFn).toHaveBeenCalledTimes(1);
    expect(getAuthToken()).toBe("ax_active");
    expect(screen.getByText("Logged In")).toBeTruthy();
  });

  test("logoutSession bernilai true dan menghapus sesi hanya setelah server mengonfirmasi", async () => {
    const logoutApiFn = mock(async () => ({ message: "Logout berhasil" }));
    const captured: { current: AuthSessionContextValue | null } = { current: null };
    renderSession(newQueryClient(), { logoutApiFn }, (context) => {
      captured.current = context;
    });
    let confirmed: boolean | undefined;

    await act(async () => {
      confirmed = await captured.current?.logoutSession();
    });

    expect(confirmed).toBe(true);
    expect(getAuthToken()).toBeNull();
    expect(screen.getByText("Logged Out")).toBeTruthy();
  });

  test("badge menampilkan galat berbahasa Indonesia dengan aksi coba lagi, lalu keluar setelah retry berhasil", async () => {
    let attempts = 0;
    const logoutApiFn = mock(async (): Promise<{ message: string }> => {
      attempts += 1;
      if (attempts === 1) {
        throw new ApiClientError("NETWORK_ERROR", "Tidak dapat terhubung ke server", 0);
      }
      return { message: "Logout berhasil" };
    });

    render(
      <AuthSessionProvider
        initialSession={activeSession}
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

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(LOGOUT_FAILED_MESSAGE);
    expect(getAuthToken()).toBe("ax_active");
    expect(screen.getByTestId("user-session-badge")).toBeTruthy();
    expect(screen.queryByText("Halaman Login Uji")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));

    await waitFor(() => expect(screen.getByText("Halaman Login Uji")).toBeTruthy());
    expect(logoutApiFn).toHaveBeenCalledTimes(2);
    expect(getAuthToken()).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("pembaruan sesi tidak memasang ulang sesi setelah sign-out (F10b)", () => {
  test("refresh yang dimulai sebelum logout dibuang dan tidak menghidupkan sesi lagi", async () => {
    const refreshGate = createDeferred<LoginResponse>();
    const refresh = mock(() => refreshGate.promise);
    const logoutApiFn = mock(async () => ({ message: "Logout berhasil" }));
    const captured: { current: AuthSessionContextValue | null } = { current: null };
    renderSession(newQueryClient(), { refreshApiFn: refresh, logoutApiFn }, (context) => {
      captured.current = context;
    });
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      fetchAcceptingToken("ax_dihidupkan_ulang"),
    );

    try {
      const settled = captureRejection(apiRequest("/documents/a", documentsSchema));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

      await act(async () => {
        await captured.current?.logoutSession();
      });
      expect(getAuthToken()).toBeNull();

      await act(async () => {
        refreshGate.resolve(loginResponseFor("ax_dihidupkan_ulang"));
        expect(await settled).toMatchObject({ status: 401 });
      });

      expect(getAuthToken()).toBeNull();
      expect(screen.getByText("Logged Out")).toBeTruthy();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("401 yang tiba setelah sign-out tidak memicu refresh", async () => {
    const refresh = mock(async () => loginResponseFor("ax_tidak_boleh"));
    const captured: { current: AuthSessionContextValue | null } = { current: null };
    renderSession(
      newQueryClient(),
      { refreshApiFn: refresh, logoutApiFn: async () => ({ message: "Logout berhasil" }) },
      (context) => {
        captured.current = context;
      },
    );
    await act(async () => {
      await captured.current?.logoutSession();
    });
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () => unauthorizedResponse()),
    );

    try {
      await act(async () => {
        await expect(apiRequest("/documents/a", documentsSchema)).rejects.toMatchObject({
          status: 401,
        });
      });

      expect(refresh).not.toHaveBeenCalled();
      expect(getAuthToken()).toBeNull();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("cache query dikosongkan saat sesi berganti (F10c)", () => {
  test("login mengosongkan cache pengguna sebelumnya", () => {
    const queryClient = newQueryClient();
    seedPreviousUserCache(queryClient);
    const captured: { current: AuthSessionContextValue | null } = { current: null };
    renderSession(queryClient, { initialSession: null }, (context) => {
      captured.current = context;
    });
    expect(cachedQueryCount(queryClient)).toBe(1);

    act(() => {
      captured.current?.loginSession(loginResponseFor("ax_login_baru", otherUser), false);
    });

    expect(cachedQueryCount(queryClient)).toBe(0);
    expect(queryClient.getQueryData(DETAIL_KEY)).toBeUndefined();
    expect(getAuthToken()).toBe("ax_login_baru");
  });

  test("logout yang dikonfirmasi server mengosongkan cache", async () => {
    const queryClient = newQueryClient();
    seedPreviousUserCache(queryClient);
    const captured: { current: AuthSessionContextValue | null } = { current: null };
    renderSession(
      queryClient,
      { logoutApiFn: async () => ({ message: "Logout berhasil" }) },
      (context) => {
        captured.current = context;
      },
    );

    await act(async () => {
      await captured.current?.logoutSession();
    });

    expect(cachedQueryCount(queryClient)).toBe(0);
  });

  test("logout yang gagal mempertahankan sesi sehingga cache juga dipertahankan", async () => {
    const queryClient = newQueryClient();
    seedPreviousUserCache(queryClient);
    const captured: { current: AuthSessionContextValue | null } = { current: null };
    renderSession(
      queryClient,
      {
        logoutApiFn: async () => {
          throw new ApiClientError("NETWORK_ERROR", "Tidak dapat terhubung ke server", 0);
        },
      },
      (context) => {
        captured.current = context;
      },
    );

    await act(async () => {
      await captured.current?.logoutSession();
    });

    expect(cachedQueryCount(queryClient)).toBe(1);
  });

  test("sign-out paksa (401 yang tidak pulih lewat refresh) mengosongkan cache", async () => {
    const queryClient = newQueryClient();
    seedPreviousUserCache(queryClient);
    const refresh = mock(async (): Promise<LoginResponse> => {
      throw new ApiClientError("UNAUTHORIZED", "Sesi berakhir", 401);
    });
    renderSession(queryClient, { refreshApiFn: refresh });
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () => unauthorizedResponse()),
    );

    try {
      await act(async () => {
        await expect(apiRequest("/documents/a", documentsSchema)).rejects.toMatchObject({
          status: 401,
        });
      });

      expect(getAuthToken()).toBeNull();
      expect(cachedQueryCount(queryClient)).toBe(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("pembaruan sesi untuk pengguna yang sama mempertahankan cache", async () => {
    const queryClient = newQueryClient();
    seedPreviousUserCache(queryClient);
    const refresh = mock(async () => loginResponseFor("ax_diperbarui", memberUser));
    renderSession(queryClient, { refreshApiFn: refresh });
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      fetchAcceptingToken("ax_diperbarui"),
    );

    try {
      await act(async () => {
        await apiRequest("/documents/a", documentsSchema);
      });

      expect(getAuthToken()).toBe("ax_diperbarui");
      expect(cachedQueryCount(queryClient)).toBe(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("pembaruan sesi yang mengembalikan pengguna lain mengosongkan cache", async () => {
    const queryClient = newQueryClient();
    seedPreviousUserCache(queryClient);
    // Cookie refresh dipakai semua tab: login pengguna lain di tab lain mengganti identitas di sini.
    const refresh = mock(async () => loginResponseFor("ax_pengguna_lain", otherUser));
    renderSession(queryClient, { refreshApiFn: refresh });
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      fetchAcceptingToken("ax_pengguna_lain"),
    );

    try {
      await act(async () => {
        await apiRequest("/documents/a", documentsSchema);
      });

      expect(getAuthToken()).toBe("ax_pengguna_lain");
      expect(cachedQueryCount(queryClient)).toBe(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
