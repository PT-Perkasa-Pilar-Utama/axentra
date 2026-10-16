// Ensure Happy DOM is available for tests
const { GlobalRegistrator } = require("@happy-dom/global-registrator");
try {
  GlobalRegistrator.register();
} catch {
  /* already registered */
}
if (typeof window !== "undefined" && window.document) {
  globalThis.document = window.document;
}

import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { CategorySummary, RecentDocument } from "@axentra/shared";
import { AuthSessionProvider } from "../src/features/auth/auth-session.context";
import { clearSession, type AuthSession } from "../src/features/auth/session.storage";
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

const createdAt = "2026-09-25T03:00:00.000Z";

const mockCategories: CategorySummary[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Reporting",
    slug: "reporting",
    downloadEnabled: false,
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Contract",
    slug: "contract",
    downloadEnabled: false,
    createdAt,
    updatedAt: createdAt,
  },
];

const mockDocuments: RecentDocument[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    filename: "laporan-tahunan.pdf",
    processingStatus: "completed",
    createdAt,
    tags: [{ id: "55555555-5555-4555-8555-555555555555", name: "Finance", createdAt }],
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    filename: "perjanjian-kerja.pdf",
    processingStatus: "completed",
    createdAt,
    tags: [{ id: "66666666-6666-4666-8666-666666666666", name: "Legal", createdAt }],
  },
];

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

describe("Category Navigation Integration (FE-S2-03 / AC-05.01, AC-05.02)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    cleanup();
    clearSession();
    globalThis.fetch = originalFetch;
  });

  test("AC-05.01: renders auto-created categories in sidebar and filters document list", async () => {
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe(`Bearer ${memberSession.token}`);

        if (url.includes("/categories?")) {
          return new Response(JSON.stringify({ success: true, data: mockCategories }), {
            status: 200,
          });
        }

        if (url.includes("/search/documents?")) {
          const urlObj = new URL(url.startsWith("http") ? url : `http://localhost${url}`);
          const categoryId = urlObj.searchParams.get("categoryId");

          if (categoryId === mockCategories[0]?.id) {
            return new Response(
              JSON.stringify({
                success: true,
                data: [
                  {
                    id: mockDocuments[0]?.id,
                    filename: mockDocuments[0]?.filename,
                    processingStatus: "completed",
                    createdAt,
                    snippet: null,
                    highlights: [],
                  },
                ],
                meta: { page: 1, limit: 20, total: 1 },
              }),
              { status: 200 },
            );
          }
          return new Response(
            JSON.stringify({ success: true, data: [], meta: { page: 1, limit: 20, total: 0 } }),
            { status: 200 },
          );
        }

        if (url.includes("/documents?")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: mockDocuments,
              meta: { page: 1, limit: 5, total: 2 },
            }),
            { status: 200 },
          );
        }

        if (url.includes("/documents/") && url.endsWith("/category")) {
          const docId = url.split("/")[url.split("/").length - 2];
          const matchedCategory =
            docId === mockDocuments[0]?.id ? mockCategories[0] : mockCategories[1];
          return new Response(JSON.stringify({ success: true, data: matchedCategory }), {
            status: 200,
          });
        }

        if (url.includes("/tags/top")) {
          return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
        }

        return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      },
      { preconnect: (): void => {} },
    );

    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const categoryNav = screen.getByRole("region", { name: "Kategori" });
    const reportingButton = await within(categoryNav).findByRole("button", { name: "Reporting" });
    const contractButton = within(categoryNav).getByRole("button", { name: "Contract" });

    expect(reportingButton).toBeTruthy();
    expect(contractButton).toBeTruthy();
    expect(reportingButton.getAttribute("aria-pressed")).toBe("false");

    // Click category "Reporting"
    await act(async () => {
      fireEvent.click(reportingButton);
    });

    expect(reportingButton.getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByText("Dokumen dalam kategori")).toBeTruthy();
    expect(screen.getByText("laporan-tahunan.pdf")).toBeTruthy();
    expect(screen.queryByText("perjanjian-kerja.pdf")).toBeNull();

    // Click clear search / filter
    const clearButton = screen.getByRole("button", { name: "Bersihkan Pencarian" });
    await act(async () => {
      fireEvent.click(clearButton);
    });

    expect(screen.getByText("Semua Dokumen")).toBeTruthy();
    expect(await screen.findByText("laporan-tahunan.pdf")).toBeTruthy();
    expect(screen.getByText("perjanjian-kerja.pdf")).toBeTruthy();
  });

  test("AC-05.02: supports switching between multiple categories (Reporting and Contract)", async () => {
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);

        if (url.includes("/categories?")) {
          return new Response(JSON.stringify({ success: true, data: mockCategories }), {
            status: 200,
          });
        }

        if (url.includes("/search/documents?")) {
          const urlObj = new URL(url.startsWith("http") ? url : `http://localhost${url}`);
          const categoryId = urlObj.searchParams.get("categoryId");

          let matchingDoc: RecentDocument | null = null;
          if (categoryId === mockCategories[0]?.id) {
            matchingDoc = mockDocuments[0] ?? null;
          } else if (categoryId === mockCategories[1]?.id) {
            matchingDoc = mockDocuments[1] ?? null;
          }

          return new Response(
            JSON.stringify({
              success: true,
              data: matchingDoc
                ? [
                    {
                      id: matchingDoc.id,
                      filename: matchingDoc.filename,
                      processingStatus: "completed",
                      createdAt,
                      snippet: null,
                      highlights: [],
                    },
                  ]
                : [],
              meta: { page: 1, limit: 20, total: matchingDoc ? 1 : 0 },
            }),
            { status: 200 },
          );
        }

        if (url.includes("/documents?")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: mockDocuments,
              meta: { page: 1, limit: 5, total: 2 },
            }),
            { status: 200 },
          );
        }

        return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      },
      { preconnect: (): void => {} },
    );

    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const categoryNav = screen.getByRole("region", { name: "Kategori" });
    const reportingButton = await within(categoryNav).findByRole("button", { name: "Reporting" });
    const contractButton = within(categoryNav).getByRole("button", { name: "Contract" });

    // Select Contract
    await act(async () => {
      fireEvent.click(contractButton);
    });

    expect(contractButton.getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByText("perjanjian-kerja.pdf")).toBeTruthy();
    expect(screen.queryByText("laporan-tahunan.pdf")).toBeNull();

    // Switch to Reporting
    await act(async () => {
      fireEvent.click(reportingButton);
    });

    expect(reportingButton.getAttribute("aria-pressed")).toBe("true");
    expect(contractButton.getAttribute("aria-pressed")).toBe("false");
    expect(await screen.findByText("laporan-tahunan.pdf")).toBeTruthy();
    expect(screen.queryByText("perjanjian-kerja.pdf")).toBeNull();

    // Toggle off Reporting
    await act(async () => {
      fireEvent.click(reportingButton);
    });

    expect(reportingButton.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("Semua Dokumen")).toBeTruthy();
  });

  test("handles category load error and allows retry", async () => {
    let failCategoryRequest = true;

    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);

        if (url.includes("/categories?")) {
          if (failCategoryRequest) {
            return new Response(JSON.stringify({ success: false, error: { message: "Gagal" } }), {
              status: 500,
            });
          }
          return new Response(JSON.stringify({ success: true, data: mockCategories }), {
            status: 200,
          });
        }

        return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      },
      { preconnect: (): void => {} },
    );

    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const categoryNav = screen.getByRole("region", { name: "Kategori" });
    expect(await within(categoryNav).findByText("Kategori gagal dimuat.")).toBeTruthy();

    const retryButton = within(categoryNav).getByRole("button", { name: "Coba lagi" });
    failCategoryRequest = false;

    await act(async () => {
      fireEvent.click(retryButton);
    });

    expect(await within(categoryNav).findByRole("button", { name: "Reporting" })).toBeTruthy();
  });
});
