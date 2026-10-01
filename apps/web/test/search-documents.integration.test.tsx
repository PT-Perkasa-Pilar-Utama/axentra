// Ensure Happy DOM is available for tests
const { GlobalRegistrator } = require("@happy-dom/global-registrator");
try {
  GlobalRegistrator.register();
} catch {
  /* already registered */
}
const _win = globalThis as unknown as { window?: { document?: Document } };
globalThis.document = _win.window?.document ?? globalThis.document;

import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AuthSessionProvider } from "../src/features/auth/auth-session.context";
import { clearSession, type AuthSession } from "../src/features/auth/session.storage";
import { router as productionRouter } from "../src/app/router";

// ── Fixtures ────────────────────────────────────────────────────────────────

const memberSession: AuthSession = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "member@axentra.test",
    name: "Member Team",
    role: "member_team",
  },
  token: "ax_member_session_token",
  rememberMe: false,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        retryDelay: 0,
      },
    },
  });
}

function createFetchMock(): typeof fetch {
  const handler = async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url = String(input);

    // MOCK FIX: Pindahkan blok /search ke ATAS agar tidak disabotase oleh blok "/documents?"
    if (url.includes("/search/documents")) {
      const urlObj = new URL(url.startsWith("http") ? url : `http://localhost${url}`);
      const keyword = urlObj.searchParams.get("keyword") || "";

      await new Promise((resolve) => setTimeout(resolve, 100));

      if (keyword.toLowerCase() === "error") {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "SERVER_ERROR", message: "Gagal memuat pencarian" },
          }),
          { status: 500 },
        );
      }

      if (keyword.toLowerCase() === "kosong") {
        return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: "doc-1",
              filename: "laporan-keuangan-2026.pdf",
              snippet: `...berdasarkan <strong>${keyword}</strong> yang telah disepakati...`,
            },
          ],
        }),
        { status: 200 },
      );
    }

    // Abaikan API default halaman Dashboard
    if (url.includes("/tags/top") || url.includes("/documents?")) {
      return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
    }

    return new Response(JSON.stringify({ success: false, error: { message: "Not found" } }), {
      status: 404,
    });
  };

  return Object.assign(handler, { preconnect: (): void => {} });
}

function renderDashboard(queryClient: QueryClient): ReturnType<typeof render> {
  const protectedRoute = productionRouter.routes.find((route) => route.path === undefined);
  const dashboardChild = protectedRoute?.children?.find((route) => route.path === "/dashboard");
  if (!protectedRoute?.element || !dashboardChild?.element) {
    throw new Error("Production dashboard route is unavailable");
  }

  const memoryRouter = createMemoryRouter(
    [
      {
        element: protectedRoute.element,
        children: [{ path: "/dashboard", element: dashboardChild.element }],
      },
    ],
    { initialEntries: ["/dashboard"] },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthSessionProvider initialSession={memberSession}>
        <RouterProvider router={memoryRouter} />
      </AuthSessionProvider>
    </QueryClientProvider>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Search Documents Integration (FE-S2-04)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    cleanup();
    clearSession();
    globalThis.fetch = originalFetch;
  });

  test("AC-06.01, AC-06.02, AC-06.03: Submits via Enter, shows loading, and displays result cards", async () => {
    globalThis.fetch = createFetchMock() as unknown as typeof fetch;
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Search");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "keuangan" } });
    });

    await act(async () => {
      fireEvent.submit(searchInput.closest("form") as HTMLFormElement);
    });

    expect(screen.getByText("Mencari dokumen...")).toBeTruthy();

    const resultFilename = await screen.findByText("laporan-keuangan-2026.pdf");
    expect(resultFilename).toBeTruthy();
    expect(screen.getByText('Hasil Pencarian: "keuangan"')).toBeTruthy();
  });

  test("AC-06.04: Displays no-result message when keyword yields empty data", async () => {
    globalThis.fetch = createFetchMock() as unknown as typeof fetch;
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Search");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "kosong" } });
      fireEvent.submit(searchInput.closest("form") as HTMLFormElement);
    });

    const emptyMessage = await screen.findByText(/Tidak ada hasil yang ditemukan untuk/i);
    expect(emptyMessage).toBeTruthy();
    expect(screen.queryByText("laporan-keuangan-2026.pdf")).toBeNull();
  });

  test("Handles error state and can retry searching", async () => {
    globalThis.fetch = createFetchMock() as unknown as typeof fetch;
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Search");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "error" } });
      fireEvent.submit(searchInput.closest("form") as HTMLFormElement);
    });

    const retryButton = await screen.findByRole("button", { name: "Coba lagi" });
    expect(retryButton).toBeTruthy();
    expect(screen.getByText("Gagal memuat hasil pencarian.")).toBeTruthy();
  });

  test("Clears search and returns to Recent Documents view", async () => {
    globalThis.fetch = createFetchMock() as unknown as typeof fetch;
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Search");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "keuangan" } });
      fireEvent.submit(searchInput.closest("form") as HTMLFormElement);
    });

    await screen.findByText("laporan-keuangan-2026.pdf");

    const clearButton = screen.getByRole("button", { name: "Bersihkan Pencarian" });
    await act(async () => {
      fireEvent.click(clearButton);
    });

    expect(screen.getByText("Semua Dokumen")).toBeTruthy();
    expect(screen.queryByText('Hasil Pencarian: "keuangan"')).toBeNull();
  });
});
