// Ensure Happy DOM is available for tests; register if not already.
const { GlobalRegistrator } = require("@happy-dom/global-registrator");
try {
  GlobalRegistrator.register();
} catch {
  /* already registered */
}
if (typeof window !== "undefined" && window.document) {
  globalThis.document = window.document;
  window.URL.createObjectURL = () => "blob:test-download";
  window.URL.revokeObjectURL = () => undefined;
}

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
  bulkDownloadHandler?: (init?: RequestInit) => Response,
): typeof fetch {
  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);

    expect(url).not.toContain("/api/v1/api/v1/");
    expect(url).not.toContain("/categories");
    expect(url).not.toContain("/search/documents");

    const authorization = new Headers(init?.headers).get("authorization");
    expect(authorization).toBe(`Bearer ${memberSession.token}`);

    if (url.includes("/documents/bulk-download")) {
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
      return bulkDownloadHandler?.(init) ?? new Response(new Blob(["zip"]), { status: 200 });
    }

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

      const responseData: RecentDocument[] = filtered.map((doc) => ({
        id: doc.id,
        filename: doc.filename,
        processingStatus: doc.processingStatus,
        createdAt: doc.createdAt,
      }));

      return new Response(buildListResponse(responseData), { status: 200 });
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
    globalThis.fetch = createFetchMock({ current: "completed" });
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
    globalThis.fetch = createFetchMock(stage);
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

    globalThis.fetch = createFetchMock({ current: "completed" }, [fourTagDoc]);
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
    globalThis.fetch = createFetchMock(stage);
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
    globalThis.fetch = createFetchMock(stage, [withTag, withoutTag]);
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

    const handler = async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
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

    globalThis.fetch = Object.assign(handler, { preconnect: (): void => {} });
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

  test("AC-10.01 selects multiple documents and starts one ZIP download", async () => {
    const firstId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const secondId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const documents: RecentDocument[] = [
      {
        id: firstId,
        filename: "laporan.pdf",
        processingStatus: "completed",
        createdAt,
        tags: [],
      },
      {
        id: secondId,
        filename: "kontrak.docx",
        processingStatus: "completed",
        createdAt,
        tags: [],
      },
    ];
    let requestBody = "";
    globalThis.fetch = createFetchMock({ current: "completed" }, documents, (init) => {
      requestBody = typeof init?.body === "string" ? init.body : "";
      return new Response(new Blob(["zip-content"], { type: "application/zip" }), {
        status: 200,
      });
    });
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const firstCheckbox = await screen.findByRole("checkbox", { name: "Pilih laporan.pdf" });
    const secondCheckbox = screen.getByRole("checkbox", { name: "Pilih kontrak.docx" });
    const downloadButton = screen.getByRole("button", { name: "Download Selected" });
    expect(downloadButton instanceof HTMLButtonElement).toBe(true);
    if (!(downloadButton instanceof HTMLButtonElement)) {
      throw new Error("Tombol unduh tidak tersedia");
    }
    expect(downloadButton.disabled).toBe(true);

    await act(async () => {
      fireEvent.click(firstCheckbox);
      fireEvent.click(secondCheckbox);
    });
    expect(downloadButton.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(downloadButton);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(requestBody).toBe(JSON.stringify({ documentIds: [firstId, secondId] }));
    if (
      !(firstCheckbox instanceof HTMLInputElement) ||
      !(secondCheckbox instanceof HTMLInputElement)
    ) {
      throw new Error("Checkbox dokumen tidak valid");
    }
    expect(firstCheckbox.checked).toBe(false);
    expect(secondCheckbox.checked).toBe(false);
  });

  test("AC-10.01 keeps selected documents and shows an error when ZIP download fails", async () => {
    const documents: RecentDocument[] = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        filename: "laporan.pdf",
        processingStatus: "completed",
        createdAt,
        tags: [],
      },
    ];
    globalThis.fetch = createFetchMock(
      { current: "completed" },
      documents,
      () =>
        new Response(
          JSON.stringify({
            success: false,
            error: { code: "NOT_FOUND", message: "Dokumen tidak ditemukan" },
          }),
          { status: 404, headers: { "content-type": "application/json" } },
        ),
    );

    await act(async () => {
      renderDashboard(makeQueryClient());
    });

    const checkbox = await screen.findByRole("checkbox", { name: "Pilih laporan.pdf" });
    const downloadButton = screen.getByRole("button", { name: "Download Selected" });
    await act(async () => {
      fireEvent.click(checkbox);
      fireEvent.click(downloadButton);
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Dokumen tidak ditemukan");
    if (!(checkbox instanceof HTMLInputElement) || !(downloadButton instanceof HTMLButtonElement)) {
      throw new Error("Kontrol unduhan tidak valid");
    }
    expect(checkbox.checked).toBe(true);
    expect(downloadButton.disabled).toBe(false);
  });
});
