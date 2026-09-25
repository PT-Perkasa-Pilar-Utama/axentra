import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
const createdAt = "2026-09-25T03:00:00.000Z";

type ListStage = "empty" | "queued" | "completed" | "error";

function recentDocument(status: RecentDocument["processingStatus"]): RecentDocument {
  return {
    id: documentId,
    filename: "laporan.pdf",
    processingStatus: status,
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

    if (url.includes("/documents?")) {
      expect(url).toContain("/api/v1/documents?");
      expect(url.includes("/api/v1/api/v1/")).toBe(false);
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

  return Object.assign(handler, {
    preconnect: (): void => {},
  });
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
        children: [
          {
            path: "/dashboard",
            element: dashboardChild.element,
          },
        ],
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

describe("Recent documents refresh after processing", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    cleanup();
    clearSession();
    globalThis.fetch = originalFetch;
  });

  test("shows laporan.pdf after the document reaches completed", async () => {
    const stage: { current: ListStage } = { current: "empty" };
    globalThis.fetch = createFetchMock(stage);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      renderDashboard(queryClient);
    });

    expect(await screen.findByText("Tidak ada hasil yang ditemukan")).toBeTruthy();

    stage.current = "queued";
    const file = new File(["laporan"], "laporan.pdf", { type: "application/pdf" });
    await act(async () => {
      fireEvent.change(screen.getByTestId("upload-file-input"), { target: { files: [file] } });
    });

    expect(await screen.findByText("laporan.pdf")).toBeTruthy();
    expect(screen.getByText("Dalam Antrean")).toBeTruthy();

    stage.current = "completed";
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2200));
    });

    expect(screen.getByText("laporan.pdf")).toBeTruthy();
    expect(screen.getByText("Selesai Diproses")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Semua Dokumen" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Pilih laporan.pdf" })).toBeTruthy();
  }, 10000);

  test("retries a failed list from the button and recovers the filename", async () => {
    const stage: { current: ListStage } = { current: "error" };
    globalThis.fetch = createFetchMock(stage);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      renderDashboard(queryClient);
    });

    expect(
      await screen.findByText("Gagal memuat dokumen.", undefined, { timeout: 4000 }),
    ).toBeTruthy();
    expect(screen.queryByText("Tidak ada hasil yang ditemukan")).toBeNull();

    stage.current = "completed";
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    });

    expect(await screen.findByText("laporan.pdf")).toBeTruthy();
    expect(screen.getByText("Selesai Diproses")).toBeTruthy();
    expect(screen.queryByText("Gagal memuat dokumen.")).toBeNull();
  }, 10000);
});
