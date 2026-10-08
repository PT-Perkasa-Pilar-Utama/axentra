// Ensure Happy DOM is available for tests; register if not already.
const { GlobalRegistrator } = require("@happy-dom/global-registrator");
try {
  GlobalRegistrator.register();
} catch {
  /* already registered */
}
const _win = globalThis as unknown as { window?: { document?: Document } };
globalThis.document = _win.window?.document ?? globalThis.document;

import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { DocumentUploadAcceptedData, RecentDocument } from "@axentra/shared";
import { AuthSessionProvider } from "../src/features/auth/auth-session.context";
import type { AuthSession } from "../src/features/auth/session.storage";
import { clearSession } from "../src/features/auth/session.storage";
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

const documentId = "22222222-2222-4222-8222-222222222222";
const tagId = "33333333-3333-4333-8333-333333333333";
const createdAt = "2026-09-25T03:00:00.000Z";

// ── Types ────────────────────────────────────────────────────────────────────

type ListStage = "empty" | "queued" | "completed" | "error" | "docs_error";

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

function recentDocument(
  status: RecentDocument["processingStatus"],
  tags: RecentDocument["tags"] = [{ id: tagId, name: "Strategy", createdAt }],
): RecentDocument {
  return { id: documentId, filename: "laporan.pdf", processingStatus: status, createdAt, tags };
}

function buildListResponse(data: RecentDocument[]): string {
  return JSON.stringify({
    success: true,
    data,
    meta: { page: 1, limit: 5, total: data.length },
  });
}

function createFetchMock(
  stage: { current: ListStage },
  documentsOverride?: RecentDocument[],
): typeof fetch {
  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);

    expect(url).not.toContain("/api/v1/api/v1/");
    expect(url).not.toContain("/categories");
    expect(url).not.toContain("/search/documents");

    const authorization = new Headers(init?.headers).get("authorization");
    expect(authorization).toBe(`Bearer ${memberSession.token}`);

    if (url.includes("/documents/upload")) {
      const accepted: DocumentUploadAcceptedData = {
        message: "File diterima untuk diproses",
        count: 1,
        files: [{ filename: "laporan.pdf", size: 123, documentType: "pdf" }],
      };
      return new Response(JSON.stringify({ success: true, data: accepted }), { status: 202 });
    }

    if (url.includes("/tags/top")) {
      if (stage.current === "error") {
        return new Response(
          JSON.stringify({ success: false, error: { code: "SERVER_ERROR", message: "Gagal" } }),
          { status: 500 },
        );
      }
      return new Response(
        JSON.stringify({
          success: true,
          data: [{ id: tagId, name: "Strategy", documentCount: 5 }],
        }),
        { status: 200 },
      );
    }

    // MOCK BARU (Resolusi F1): Endpoint spesifik untuk mengambil tag per dokumen
    if (url.includes("/smart-tags")) {
      const urlBase = url.split("?")[0] ?? "";
      const parts = urlBase.split("/");
      const docId = parts[parts.length - 2]; // Mendapatkan ID dari /documents/:id/smart-tags

      const baseDocs: RecentDocument[] =
        documentsOverride ??
        (stage.current === "empty"
          ? []
          : [recentDocument(stage.current === "queued" ? "queued" : "completed")]);

      const targetDoc = baseDocs.find((d) => d.id === docId);

      return new Response(
        JSON.stringify({
          success: true,
          data: targetDoc?.tags ?? [],
        }),
        { status: 200 },
      );
    }

    if (url.includes("/documents?")) {
      expect(url).toContain("/api/v1/documents?");

      if (stage.current === "error" || stage.current === "docs_error") {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "UPSTREAM_ERROR", message: "Gagal memuat dokumen" },
          }),
          { status: 503 },
        );
      }

      const baseDocs: RecentDocument[] =
        documentsOverride ??
        (stage.current === "empty"
          ? []
          : [recentDocument(stage.current === "queued" ? "queued" : "completed")]);

      const queryString = url.includes("?") ? (url.split("?")[1] ?? "") : "";
      const params = new URLSearchParams(queryString);
      const requestedTags = params.getAll("tags");

      const filtered =
        requestedTags.length === 0
          ? baseDocs
          : baseDocs.filter((doc) =>
              // PERBAIKAN (Resolusi F6): Menggunakan .every() untuk logika AND sesuai AC-04.04
              requestedTags.every((reqTag) => doc.tags?.some((t) => t.name === reqTag)),
            );

      const responseData = filtered.map((doc) => {
        const { tags: _tags, ...rest } = doc;
        return rest;
      });

      return new Response(buildListResponse(responseData as RecentDocument[]), { status: 200 });
    }

    return new Response(
      JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Tidak ditemukan" } }),
      { status: 404 },
    );
  };

  return Object.assign(handler, { preconnect: (): void => {} });
}
function renderDashboard(queryClient: QueryClient): ReturnType<typeof render> {
  const protectedRoute = productionRouter.routes.find((route) => route.path === undefined);
  const dashboardChild = protectedRoute?.children?.find((route) => route.path === "/dashboard");
  if (protectedRoute?.element === undefined || dashboardChild?.element === undefined) {
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

describe("Recent documents and Tags integration", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    cleanup();
    clearSession();
    globalThis.fetch = originalFetch;
  });

  test("FE-S2-03 shows unavailable categories without fake filters or category API calls", async () => {
    globalThis.fetch = createFetchMock({ current: "completed" }) as unknown as typeof fetch;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await act(async () => {
      renderDashboard(queryClient);
    });

    const categories = screen.getByRole("region", { name: "Kategori" });
    expect(within(categories).getByText("Kategori belum tersedia")).toBeTruthy();
    expect(
      within(categories).getByText(
        "Navigasi kategori belum aktif. Untuk sementara, gunakan daftar dokumen terbaru di dasbor.",
      ),
    ).toBeTruthy();
    expect(within(categories).queryByText(/daftar semua dokumen/i)).toBeNull();
    expect(within(categories).queryByRole("button")).toBeNull();
    expect(within(categories).queryByRole("link")).toBeNull();
    expect(screen.getAllByRole("heading", { name: "Kategori" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(await screen.findByText("laporan.pdf")).toBeTruthy();
    expect(screen.getByText("Selesai Diproses")).toBeTruthy();
  });

  test("shows laporan.pdf and its Smart Tag after the document reaches completed", async () => {
    const stage: { current: ListStage } = { current: "empty" };
    globalThis.fetch = createFetchMock(stage) as unknown as typeof fetch;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await act(async () => {
      renderDashboard(queryClient);
    });
    expect(await screen.findByText("Tidak ada hasil yang ditemukan")).toBeTruthy();

    stage.current = "queued";
    const file = new File(["laporan"], "laporan.pdf", { type: "application/pdf" });
    await act(async () => {
      fireEvent.change(screen.getByTestId("upload-file-input"), { target: { files: [file] } });
    });

    stage.current = "completed";
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2200));
    });

    expect(screen.getByText("laporan.pdf")).toBeTruthy();
    expect(screen.getAllByText("Strategy").length).toBeGreaterThanOrEqual(1);
  }, 10000);

  test("shows at most 3 tag chips even when the document has more than 3 tags", async () => {
    const fourTagDoc: RecentDocument = {
      id: documentId,
      filename: "banyak-tag.pdf",
      processingStatus: "completed",
      createdAt,
      tags: [
        { id: "11111111-1111-4111-8111-111111111111", name: "Alpha", createdAt },
        { id: "22222222-2222-4222-8222-222222222222", name: "Beta", createdAt },
        { id: "33333333-3333-4333-8333-333333333333", name: "Gamma", createdAt },
        { id: "44444444-4444-4444-8444-444444444444", name: "Delta", createdAt },
      ],
    };

    globalThis.fetch = createFetchMock({ current: "completed" }, [
      fourTagDoc,
    ]) as unknown as typeof fetch;
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    expect(await screen.findByText("banyak-tag.pdf", undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.getByText("Gamma")).toBeTruthy();
    expect(screen.queryByText("Delta")).toBeNull();
  });

  test("shows Coba lagi button when document list fails and refetches after click", async () => {
    const stage: { current: ListStage } = { current: "docs_error" };
    globalThis.fetch = createFetchMock(stage) as unknown as typeof fetch;
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const retryButton = await screen.findByRole("button", { name: "Coba lagi" }, { timeout: 5000 });
    expect(retryButton).toBeTruthy();

    stage.current = "completed";
    await act(async () => {
      fireEvent.click(retryButton);
    });

    expect(await screen.findByText("laporan.pdf")).toBeTruthy();
  });

  test("filters documents when a top tag is clicked and hides unmatched results", async () => {
    const withTag = recentDocument("completed");
    const withoutTag: RecentDocument = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      filename: "tanpa-tag.pdf",
      processingStatus: "completed",
      createdAt,
      tags: [],
    };

    const stage: { current: ListStage } = { current: "completed" };
    globalThis.fetch = createFetchMock(stage, [withTag, withoutTag]) as unknown as typeof fetch;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await act(async () => {
      renderDashboard(queryClient);
    });

    expect(await screen.findByText("laporan.pdf")).toBeTruthy();
    expect(screen.getByText("tanpa-tag.pdf")).toBeTruthy();

    const topTagButton = screen.getByRole("button", { name: "Strategy" });
    await act(async () => {
      fireEvent.click(topTagButton);
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(await screen.findByText("laporan.pdf")).toBeTruthy();
    expect(screen.queryByText("tanpa-tag.pdf")).toBeNull();
    expect(topTagButton.getAttribute("aria-pressed")).toBe("true");
  });

  test("F3 regression: refreshes Top Tags when upload completes even if active filter hides the queued document", async () => {
    const existingDoc = recentDocument("completed", [{ id: tagId, name: "Strategy", createdAt }]);
    const newDocId = "44444444-4444-4444-8444-444444444444";
    let isNewDocQueued = false;
    let isNewDocCompleted = false;

    const dynamicDocs = (): RecentDocument[] => {
      const docs = [existingDoc];
      if (isNewDocQueued) {
        docs.push({
          id: newDocId,
          filename: "kontrak-baru.pdf",
          processingStatus: "queued",
          createdAt,
          tags: [],
        });
      } else if (isNewDocCompleted) {
        docs.push({
          id: newDocId,
          filename: "kontrak-baru.pdf",
          processingStatus: "completed",
          createdAt,
          tags: [{ id: "77777777-7777-4777-8777-777777777777", name: "Finance", createdAt }],
        });
      }
      return docs;
    };

    const topTagsList = (): { id: string; name: string; documentCount: number }[] => {
      const tags = [{ id: tagId, name: "Strategy", documentCount: 5 }];
      if (isNewDocCompleted) {
        tags.push({
          id: "77777777-7777-4777-8777-777777777777",
          name: "Finance",
          documentCount: 1,
        });
      }
      return tags;
    };

    const handler = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes("/documents/upload")) {
        isNewDocQueued = true;
        const accepted: DocumentUploadAcceptedData = {
          message: "File diterima untuk diproses",
          count: 1,
          files: [{ filename: "kontrak-baru.pdf", size: 123, documentType: "pdf" }],
        };
        return new Response(JSON.stringify({ success: true, data: accepted }), { status: 202 });
      }

      if (url.includes("/tags/top")) {
        return new Response(JSON.stringify({ success: true, data: topTagsList() }), {
          status: 200,
        });
      }

      if (url.includes("/smart-tags")) {
        const urlBase = url.split("?")[0] ?? "";
        const parts = urlBase.split("/");
        const docId = parts[parts.length - 2];
        const targetDoc = dynamicDocs().find((d) => d.id === docId);
        const isQueued = targetDoc?.processingStatus === "queued";
        return new Response(
          JSON.stringify({ success: true, data: isQueued ? [] : (targetDoc?.tags ?? []) }),
          { status: 200 },
        );
      }

      if (url.includes("/documents?")) {
        const queryString = url.includes("?") ? (url.split("?")[1] ?? "") : "";
        const params = new URLSearchParams(queryString);
        const requestedTags = params.getAll("tags");
        const allDocs = dynamicDocs();
        const filtered =
          requestedTags.length === 0
            ? allDocs
            : allDocs.filter((doc) =>
                requestedTags.every((reqTag) => doc.tags?.some((t) => t.name === reqTag)),
              );

        return new Response(
          JSON.stringify({
            success: true,
            data: filtered,
            meta: { page: 1, limit: 5, total: filtered.length },
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ success: false }), { status: 404 });
    };

    globalThis.fetch = handler as unknown as typeof fetch;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await act(async () => {
      renderDashboard(queryClient);
    });

    expect(await screen.findByText("Strategy")).toBeTruthy();

    const strategyButton = screen.getByRole("button", { name: "Strategy" });
    await act(async () => {
      fireEvent.click(strategyButton);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const file = new File(["kontrak"], "kontrak-baru.pdf", { type: "application/pdf" });
    await act(async () => {
      fireEvent.change(screen.getByTestId("upload-file-input"), { target: { files: [file] } });
    });

    isNewDocQueued = false;
    isNewDocCompleted = true;

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2200));
    });

    expect(await screen.findByRole("button", { name: "Finance" })).toBeTruthy();
  }, 10000);

  test("F7 regression: does not cache empty smart tags while queued and renders tags on completion without waiting for staleTime", async () => {
    let docStatus: RecentDocument["processingStatus"] = "queued";
    let smartTagsCallCount = 0;

    const testDoc: RecentDocument = {
      id: "55555555-5555-5555-8555-555555555555",
      filename: "f7-test.pdf",
      processingStatus: docStatus,
      createdAt,
      tags: [{ id: "88888888-8888-4888-8888-888888888888", name: "SmartF7", createdAt }],
    };

    const handler = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes("/tags/top")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [{ id: tagId, name: "Strategy", documentCount: 5 }],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/smart-tags")) {
        smartTagsCallCount++;
        if (docStatus === "queued") {
          return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: [{ id: "88888888-8888-4888-8888-888888888888", name: "SmartF7" }],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/documents?")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [{ ...testDoc, processingStatus: docStatus }],
            meta: { page: 1, limit: 5, total: 1 },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: false }), { status: 404 });
    };

    globalThis.fetch = handler as unknown as typeof fetch;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await act(async () => {
      renderDashboard(queryClient);
    });

    expect(await screen.findByText("f7-test.pdf")).toBeTruthy();
    expect(screen.getByText("Dalam Antrean")).toBeTruthy();
    expect(smartTagsCallCount).toBe(0);

    docStatus = "completed";

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2200));
    });

    expect(await screen.findByText("Selesai Diproses")).toBeTruthy();
    expect(await screen.findByText("SmartF7")).toBeTruthy();
    expect(smartTagsCallCount).toBeGreaterThanOrEqual(1);
  }, 10000);
});
