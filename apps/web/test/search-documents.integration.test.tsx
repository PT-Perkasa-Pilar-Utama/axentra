// Ensure Happy DOM is available for tests
const { GlobalRegistrator } = require("@happy-dom/global-registrator");
try {
  GlobalRegistrator.register();
} catch {
  /* already registered */
}

// Resolusi F6: Hapus as unknown as { window?: ... }
if (typeof window !== "undefined" && window.document) {
  globalThis.document = window.document;
}

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

    if (url.includes("/search/documents")) {
      const urlObj = new URL(url.startsWith("http") ? url : `http://localhost${url}`);
      const q = urlObj.searchParams.get("q") || "";

      await new Promise((resolve) => setTimeout(resolve, 100));

      if (q.toLowerCase() === "error") {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "SERVER_ERROR", message: "Gagal memuat pencarian" },
          }),
          { status: 500 },
        );
      }

      if (q.toLowerCase() === "kosong") {
        return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              filename: "laporan-keuangan-2026.pdf",
              processingStatus: "completed",
              createdAt: "2026-09-22T00:00:00.000Z",
              snippet: `...berdasarkan ${q} yang telah disepakati...`,
              highlights: [],
            },
          ],
        }),
        { status: 200 },
      );
    }

    if (url.includes("/tags/top") || url.includes("/documents?")) {
      return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
    }

    return new Response(JSON.stringify({ success: false, error: { message: "Not found" } }), {
      status: 404,
    });
  };

  return Object.assign(handler, { preconnect: (): void => {} });
}

function createSuccessFetchMock(): typeof fetch {
  const handler = async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url = String(input);

    if (url.includes("/search/documents")) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              filename: "laporan-keuangan-2026.pdf",
              processingStatus: "completed",
              createdAt: "2026-09-22T00:00:00.000Z",
              snippet: "...berdasarkan error yang telah disepakati...",
              highlights: [],
            },
          ],
        }),
        { status: 200 },
      );
    }

    return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
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

  test("AC-06.01: Submits via Enter key and displays at least one result", async () => {
    // Resolusi F6: Hapus casting 'as unknown as typeof fetch'
    globalThis.fetch = createFetchMock();
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Cari dokumen...");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "keuangan" } });
    });

    await act(async () => {
      fireEvent.keyDown(searchInput, { key: "Enter", code: "Enter", keyCode: 13, charCode: 13 });
      fireEvent.submit(searchInput.closest("form") as HTMLFormElement);
    });

    expect(screen.getByText("Mencari dokumen...")).toBeTruthy();
    const resultFilename = await screen.findByText("laporan-keuangan-2026.pdf");
    expect(resultFilename).toBeTruthy();
  });

  test("AC-06.02: Each result card shows filename and text snippet", async () => {
    // Resolusi F6: Hapus casting
    globalThis.fetch = createFetchMock();
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Cari dokumen...");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "keuangan" } });
      fireEvent.keyDown(searchInput, { key: "Enter", code: "Enter", keyCode: 13, charCode: 13 });
      fireEvent.submit(searchInput.closest("form") as HTMLFormElement);
    });

    expect(await screen.findByText("laporan-keuangan-2026.pdf")).toBeTruthy();
    expect(screen.getByText(/berdasarkan keuangan yang telah disepakati/i)).toBeTruthy();
    expect(screen.getByText('Hasil Pencarian: "keuangan"')).toBeTruthy();
  });

  test("AC-06.04: Displays no-result message when keyword yields empty data", async () => {
    // Resolusi F6: Hapus casting
    globalThis.fetch = createFetchMock();
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Cari dokumen...");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "kosong" } });
      fireEvent.keyDown(searchInput, { key: "Enter", code: "Enter", keyCode: 13, charCode: 13 });
      fireEvent.submit(searchInput.closest("form") as HTMLFormElement);
    });

    const emptyMessage = await screen.findByText(/Tidak ada hasil yang ditemukan untuk/i);
    expect(emptyMessage).toBeTruthy();
    expect(screen.queryByText("laporan-keuangan-2026.pdf")).toBeNull();
  });

  test("Handles error state: retry button click recovers and shows results", async () => {
    // Resolusi F6: Hapus casting
    globalThis.fetch = createFetchMock();
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Cari dokumen...");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "error" } });
      fireEvent.keyDown(searchInput, { key: "Enter", code: "Enter", keyCode: 13, charCode: 13 });
      fireEvent.submit(searchInput.closest("form") as HTMLFormElement);
    });

    const retryButton = await screen.findByRole("button", { name: "Coba lagi" });
    expect(retryButton).toBeTruthy();
    expect(screen.getByText("Gagal memuat hasil pencarian.")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();

    // Resolusi F6: Hapus casting
    globalThis.fetch = createSuccessFetchMock();

    await act(async () => {
      fireEvent.click(retryButton);
    });

    expect(await screen.findByText("laporan-keuangan-2026.pdf")).toBeTruthy();
    expect(screen.queryByText("Gagal memuat hasil pencarian.")).toBeNull();
  });

  test("Clears search and returns to Recent Documents view", async () => {
    // Resolusi F6: Hapus casting
    globalThis.fetch = createFetchMock();
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Cari dokumen...");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "keuangan" } });
      fireEvent.keyDown(searchInput, { key: "Enter", code: "Enter", keyCode: 13, charCode: 13 });
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
