import { afterEach, describe, expect, test, mock } from "bun:test";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { DocumentUploadAcceptedData, RecentDocument } from "@axentra/shared";
import { AuthSessionProvider } from "../src/features/auth/auth-session.context";
import type { AuthSession } from "../src/features/auth/session.storage";
import { clearSession } from "../src/features/auth/session.storage";
import { router as productionRouter } from "../src/app/router";

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

type ListStage = "empty" | "queued" | "completed" | "error";

function recentDocument(status: RecentDocument["processingStatus"]): RecentDocument {
  return {
    id: documentId,
    filename: "laporan.pdf",
    processingStatus: status,
    tags: [{ id: tagId, name: "Strategy", createdAt }],
    createdAt,
  };
}

function listResponse(stage: Exclude<ListStage, "error">): string {
  const data = stage === "empty" ? [] : [recentDocument(stage)];
  return JSON.stringify({
    success: true,
    data,
    meta: { page: 1, limit: 5, total: data.length },
  });
}

function createFetchMock(stage: { current: ListStage }): typeof fetch {
  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
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

    if (url.includes("/documents?")) {
      expect(url).toContain("/api/v1/documents?");
      if (stage.current === "error") {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "UPSTREAM_ERROR", message: "Gagal memuat dokumen" },
          }),
          { status: 503 },
        );
      }
      return new Response(listResponse(stage.current), { status: 200 });
    }

    return new Response(
      JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Tidak ditemukan" } }),
      { status: 404 },
    );
  };

  return Object.assign(handler, { preconnect: (): void => { } });
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

describe("Recent documents and Tags integration", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    cleanup();
    clearSession();
    globalThis.fetch = originalFetch;
  });

  test("FE-S2-03 shows unavailable categories without fake filters or category API calls", async () => {
    globalThis.fetch = createFetchMock({ current: "completed" });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

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

  test("shows laporan.pdf after the document reaches completed", async () => {
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
      expect(screen.getAllByText("Strategy")).toBeTruthy();
    }, 10000);

    test("filters documents when a top tag is clicked", async () => {
      const stage: { current: ListStage } = { current: "completed" };
      const fetchMock = mock(createFetchMock(stage));

      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      await act(async () => {
        renderDashboard(queryClient);
      });

      const topTagButton = await screen.findByRole("button", { name: "Strategy" });
      expect(topTagButton).toBeTruthy();

      await act(async () => {
        fireEvent.click(topTagButton);
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const calls = fetchMock.mock.calls;
      const refetchCall = calls.find((c) => String(c[0]).includes(`tagIds=${tagId}`));
      expect(refetchCall).toBeDefined();
    });
  })
})
