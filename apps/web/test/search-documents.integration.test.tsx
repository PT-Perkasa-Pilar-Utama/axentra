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
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

    if (url.includes("/categories?") || url.includes("/tags/top") || url.includes("/documents?")) {
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

const topTagIds: Record<string, string> = {
  Strategy: "66666666-6666-4666-8666-666666666666",
  Legal: "77777777-7777-4777-8777-777777777777",
};

type SearchCorpusDocument = { id: string; filename: string; tags: string[] };

// Mock pencarian dengan filter tag AND (sama seperti server) dan Top Tags kontekstual.
function createTagSearchFetch(corpus: SearchCorpusDocument[], log: string[]): typeof fetch {
  const handler = async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(input), "http://localhost");
    log.push(`${url.pathname}${url.search}`);

    if (url.pathname === "/api/v1/search/documents") {
      const tags = url.searchParams.getAll("tags");
      const matched = corpus.filter((doc) => tags.every((tag) => doc.tags.includes(tag)));
      return Response.json({
        success: true,
        data: matched.map((doc) => ({
          id: doc.id,
          filename: doc.filename,
          processingStatus: "completed",
          createdAt: "2026-09-22T00:00:00.000Z",
          snippet: `...${doc.filename}...`,
          highlights: [],
        })),
        meta: { page: 1, limit: 20, total: matched.length },
      });
    }

    if (url.pathname === "/api/v1/tags/top") {
      const ids = url.searchParams.getAll("documentIds");
      const scope =
        url.searchParams.get("context") === "search"
          ? corpus.filter((doc) => ids.includes(doc.id))
          : corpus;
      const counts = new Map<string, number>();
      for (const doc of scope) {
        for (const tag of doc.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
      return Response.json({
        success: true,
        data: [...counts].map(([name, documentCount]) => ({
          id: topTagIds[name],
          name,
          documentCount,
        })),
      });
    }

    return Response.json({ success: true, data: [] });
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

  // Resolusi F2 & F6: Memisahkan event Enter dan form submit dengan test helper
  const submitSearch = (input: HTMLElement) => {
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", keyCode: 13, charCode: 13 });
    const form = input.closest("form");
    if (!form) throw new Error("Search form element not found in the DOM");
    fireEvent.submit(form);
  };

  test("AC-06.01: Submits via Enter key and displays at least one result", async () => {
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
      submitSearch(searchInput);
    });

    expect(screen.getByText("Mencari dokumen...")).toBeTruthy();
    const resultFilename = await screen.findByText("laporan-keuangan-2026.pdf");
    expect(resultFilename).toBeTruthy();
  });

  test("AC-06.02: Each result card shows filename and text snippet", async () => {
    globalThis.fetch = createFetchMock();
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Cari dokumen...");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "keuangan" } });
      submitSearch(searchInput);
    });

    expect(await screen.findByText("laporan-keuangan-2026.pdf")).toBeTruthy();
    expect(screen.getByText(/berdasarkan keuangan yang telah disepakati/i)).toBeTruthy();
    expect(screen.getByText('Hasil Pencarian: "keuangan"')).toBeTruthy();
  });

  test("AC-06.04: Displays no-result message when keyword yields empty data", async () => {
    globalThis.fetch = createFetchMock();
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Cari dokumen...");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "kosong" } });
      submitSearch(searchInput);
    });

    const emptyMessage = await screen.findByText(/Tidak ada hasil yang ditemukan untuk/i);
    expect(emptyMessage).toBeTruthy();
    expect(screen.queryByText("laporan-keuangan-2026.pdf")).toBeNull();
  });

  test("Handles error state: retry button click recovers and shows results", async () => {
    globalThis.fetch = createFetchMock();
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Cari dokumen...");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "error" } });
      submitSearch(searchInput);
    });

    const retryButton = await screen.findByRole("button", { name: "Coba lagi" });
    expect(retryButton).toBeTruthy();
    expect(screen.getByText("Gagal memuat hasil pencarian.")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();

    globalThis.fetch = createSuccessFetchMock();

    await act(async () => {
      fireEvent.click(retryButton);
    });

    expect(await screen.findByText("laporan-keuangan-2026.pdf")).toBeTruthy();
    expect(screen.queryByText("Gagal memuat hasil pencarian.")).toBeNull();
  });

  test("Clears search and returns to Recent Documents view", async () => {
    globalThis.fetch = createFetchMock();
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Cari dokumen...");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "keuangan" } });
      submitSearch(searchInput);
    });

    await screen.findByText("laporan-keuangan-2026.pdf");

    const clearButton = screen.getByRole("button", { name: "Bersihkan Pencarian" });
    await act(async () => {
      fireEvent.click(clearButton);
    });

    expect(screen.getByText("Semua Dokumen")).toBeTruthy();
    expect(screen.queryByText('Hasil Pencarian: "keuangan"')).toBeNull();
  });

  test("AC-04.01: search results show Top Tags for the returned documents and render no selection checkboxes (FE-S2-04 disabled controls removed)", async () => {
    const requestLog: string[] = [];
    globalThis.fetch = createTagSearchFetch(
      [
        {
          id: "11111111-1111-4111-8111-111111111111",
          filename: "gabungan.pdf",
          tags: ["Strategy", "Legal"],
        },
        { id: "22222222-2222-4222-8222-222222222222", filename: "legal.pdf", tags: ["Legal"] },
      ],
      requestLog,
    );
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Cari dokumen...");
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "keuangan" } });
      submitSearch(searchInput);
    });

    expect(await screen.findByText("gabungan.pdf")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();

    const topTagsPanel = await screen.findByLabelText("Top Tags");
    expect(within(topTagsPanel).getByRole("button", { name: "Strategy" })).toBeTruthy();
    expect(within(topTagsPanel).getByRole("button", { name: "Legal" })).toBeTruthy();

    const searchTopTagsRequest = requestLog.filter(
      (entry) => entry.startsWith("/api/v1/tags/top") && entry.includes("context=search"),
    );
    expect(searchTopTagsRequest.length).toBeGreaterThan(0);
    const lastRequest = searchTopTagsRequest[searchTopTagsRequest.length - 1] ?? "";
    expect(lastRequest).toContain("documentIds=11111111-1111-4111-8111-111111111111");
    expect(lastRequest).toContain("documentIds=22222222-2222-4222-8222-222222222222");
  });

  test("AC-04.03: clicking a Top Tags chip on search results re-runs the search with that tag, and clicking it again removes the filter", async () => {
    const requestLog: string[] = [];
    globalThis.fetch = createTagSearchFetch(
      [
        {
          id: "11111111-1111-4111-8111-111111111111",
          filename: "gabungan.pdf",
          tags: ["Strategy", "Legal"],
        },
        { id: "22222222-2222-4222-8222-222222222222", filename: "legal.pdf", tags: ["Legal"] },
      ],
      requestLog,
    );
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Cari dokumen...");
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "keuangan" } });
      submitSearch(searchInput);
    });
    expect(await screen.findByText("legal.pdf")).toBeTruthy();

    const chip = async (): Promise<HTMLElement> =>
      within(await screen.findByLabelText("Top Tags")).getByRole("button", { name: "Strategy" });

    await act(async () => {
      fireEvent.click(await chip());
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(await screen.findByText("gabungan.pdf")).toBeTruthy();
    expect(screen.queryByText("legal.pdf")).toBeNull();
    expect((await chip()).getAttribute("aria-pressed")).toBe("true");
    expect(
      requestLog.some((entry) =>
        entry.includes("/api/v1/search/documents?q=keuangan&tags=Strategy"),
      ),
    ).toBe(true);

    await act(async () => {
      fireEvent.click(await chip());
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(await screen.findByText("legal.pdf")).toBeTruthy();
    expect((await chip()).getAttribute("aria-pressed")).toBe("false");
  });
});
