import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { CategorySummary } from "@axentra/shared";
import { AuthSessionProvider } from "../src/features/auth/auth-session.context";
import { clearSession, type AuthSession } from "../src/features/auth/session.storage";
import { router as productionRouter } from "../src/app/router";

const headOfTeamSession: AuthSession = {
  user: {
    id: "22222222-2222-4222-8222-222222222222",
    email: "head@axentra.test",
    name: "Head of Team",
    role: "head_of_team",
  },
  token: "ax_head_session_token",
  rememberMe: false,
};

const memberTeamSession: AuthSession = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "member@axentra.test",
    name: "Member Team",
    role: "member_team",
  },
  token: "ax_member_session_token",
  rememberMe: false,
};

const adminSession: AuthSession = {
  user: { ...headOfTeamSession.user, role: "admin" },
  token: "ax_admin_session_token",
  rememberMe: false,
};

const sampleCategories: CategorySummary[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Reporting",
    slug: "reporting",
    downloadEnabled: false,
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Analytics",
    slug: "analytics",
    downloadEnabled: true,
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Dashboard",
    slug: "dashboard",
    downloadEnabled: true,
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  },
];

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
      mutations: { retry: false },
    },
  });
}

function mockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return Object.assign(handler, { preconnect: (): void => {} });
}

function categoriesListResponse(items: CategorySummary[]): Response {
  return new Response(JSON.stringify({ success: true, data: items }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function renderPermissionCategories(
  session: AuthSession,
  queryClient = makeQueryClient(),
): ReturnType<typeof render> {
  const memoryRouter = createMemoryRouter(productionRouter.routes, {
    initialEntries: ["/permission-categories"],
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthSessionProvider initialSession={session}>
        <RouterProvider router={memoryRouter} />
      </AuthSessionProvider>
    </QueryClientProvider>,
  );
}

describe("Permission Categories Feature (FE-S4-03 / AC-13.01)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    cleanup();
    clearSession();
    globalThis.fetch = originalFetch;
  });

  test("AC-13.01: displays categories and their download permission toggle switches", async () => {
    globalThis.fetch = mockFetch(async (input: RequestInfo | URL) => {
      if (String(input).includes("/permission-categories")) {
        return categoriesListResponse(sampleCategories);
      }
      return new Response(JSON.stringify({ success: false }), { status: 404 });
    });

    renderPermissionCategories(headOfTeamSession);

    expect(await screen.findByRole("heading", { name: "Permission Category" })).toBeTruthy();
    expect(screen.getByText("Reporting")).toBeTruthy();
    expect(screen.getByText("Analytics")).toBeTruthy();
    const categoryList = screen.getByRole("list", { name: "Daftar izin kategori dokumen" });
    expect(within(categoryList).getByText("Dashboard")).toBeTruthy();

    const reportingSwitch = within(categoryList).getByRole("switch", {
      name: "Izin unduh kategori Reporting",
    });
    const analyticsSwitch = within(categoryList).getByRole("switch", {
      name: "Izin unduh kategori Analytics",
    });

    expect(reportingSwitch.getAttribute("aria-checked")).toBe("false");
    expect(reportingSwitch.className).not.toContain("is-active");

    expect(analyticsSwitch.getAttribute("aria-checked")).toBe("true");
    expect(analyticsSwitch.className).toContain("is-active");
  });

  test("AC-13.01: toggles permission from inactive to Active via PATCH API", async () => {
    let currentCategories = [...sampleCategories];
    let patchCalledWith = { id: "", downloadEnabled: false };

    globalThis.fetch = mockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/permission-categories/") && method === "PATCH") {
        const segments = url.split("/permission-categories/")[1]?.split("?") ?? [];
        const id = segments[0] ?? "";
        const body = JSON.parse(String(init?.body));
        patchCalledWith = { id, downloadEnabled: body.downloadEnabled };

        currentCategories = currentCategories.map((c) =>
          c.id === id ? { ...c, downloadEnabled: body.downloadEnabled } : c,
        );
        const updatedItem = currentCategories.find((c) => c.id === id);
        return new Response(JSON.stringify({ success: true, data: updatedItem }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.includes("/permission-categories") && method === "GET") {
        return categoriesListResponse(currentCategories);
      }

      return new Response(JSON.stringify({ success: false }), { status: 404 });
    });

    renderPermissionCategories(headOfTeamSession);

    const reportingSwitch = await screen.findByRole("switch", {
      name: "Izin unduh kategori Reporting",
    });
    expect(reportingSwitch.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      fireEvent.click(reportingSwitch);
    });

    expect(patchCalledWith).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      downloadEnabled: true,
    });

    const updatedReportingSwitch = await screen.findByRole("switch", {
      name: "Izin unduh kategori Reporting",
    });
    expect(updatedReportingSwitch.getAttribute("aria-checked")).toBe("true");
    expect(updatedReportingSwitch.className).toContain("is-active");
  });

  test("shows access denied for API 403 without retry or leaking server detail", async () => {
    let requestCount = 0;
    globalThis.fetch = mockFetch(async () => {
      requestCount += 1;
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: "FORBIDDEN", message: "Internal role forbidden" },
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    });

    renderPermissionCategories(headOfTeamSession);

    expect(
      await screen.findByText("Anda tidak memiliki izin untuk mengatur izin unduh kategori."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Coba lagi" })).toBeNull();
    expect(screen.queryByText("Internal role forbidden")).toBeNull();
    expect(requestCount).toBe(1);
  });

  test("shows safe error and retries transient API failure", async () => {
    let callCount = 0;
    globalThis.fetch = mockFetch(async () => {
      callCount += 1;
      return callCount <= 3
        ? new Response(
            JSON.stringify({ success: false, error: { code: "SERVER_ERROR", message: "boom" } }),
            { status: 500, headers: { "content-type": "application/json" } },
          )
        : categoriesListResponse(sampleCategories);
    });

    renderPermissionCategories(headOfTeamSession);

    expect(await screen.findByText("Daftar kategori gagal dimuat.")).toBeTruthy();
    expect(screen.queryByText("boom")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    });

    expect(await screen.findByText("Reporting")).toBeTruthy();
    expect(callCount).toBe(4);
  });

  test("displays empty state when no categories exist", async () => {
    globalThis.fetch = mockFetch(async () => categoriesListResponse([]));

    renderPermissionCategories(headOfTeamSession);

    expect(await screen.findByText("Belum ada kategori dokumen.")).toBeTruthy();
  });

  test("blocks member_team access at the route without sending permission requests", async () => {
    let requestCount = 0;
    globalThis.fetch = mockFetch(async () => {
      requestCount += 1;
      return categoriesListResponse(sampleCategories);
    });

    renderPermissionCategories(memberTeamSession);

    expect(screen.getByText("Akses Dibatasi")).toBeTruthy();
    expect(requestCount).toBe(0);
  });

  test("blocks admin access at the route without sending permission requests", async () => {
    let requestCount = 0;
    globalThis.fetch = mockFetch(async () => {
      requestCount += 1;
      return categoriesListResponse(sampleCategories);
    });

    renderPermissionCategories(adminSession);

    expect(screen.getByText("Akses Dibatasi")).toBeTruthy();
    expect(requestCount).toBe(0);
  });
});
