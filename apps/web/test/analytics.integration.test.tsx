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
import type { AnalyticsSummary, CategorySummary } from "@axentra/shared";
import { AuthSessionProvider } from "../src/features/auth/auth-session.context";
import { clearSession, type AuthSession } from "../src/features/auth/session.storage";
import { router as productionRouter } from "../src/app/router";

const ANALYTICS_PATH = "/analytics";
const DASHBOARD_PATH = "/dashboard";
const ANALYTICS_REGION = "Dasbor analitik";

const headSession: AuthSession = {
  user: {
    id: "22222222-2222-4222-8222-222222222222",
    email: "head@axentra.test",
    name: "Head of Team",
    role: "head_of_team",
  },
  token: "ax_head_session_token",
  rememberMe: false,
};

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

const summary: AnalyticsSummary = { totalDocuments: 1284, uploadedLast7Days: 86 };

const createdAt = "2026-09-25T03:00:00.000Z";
const reportingCategory: CategorySummary = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Reporting",
  slug: "reporting",
  downloadEnabled: false,
  createdAt,
  updatedAt: createdAt,
};

type SummaryResponder = () => Response | Promise<Response>;

type MockApiResult = { analyticsRequests: number; analyticsAuthorization: string | null };

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** Menjawab per URL: halaman Analitik memanggil summary dan kategori (sidebar). */
function mockApi(
  respondSummary: SummaryResponder,
  categories: CategorySummary[] = [],
): MockApiResult {
  const result: MockApiResult = { analyticsRequests: 0, analyticsAuthorization: null };

  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes("/analytics/summary")) {
        result.analyticsRequests += 1;
        result.analyticsAuthorization = new Headers(init?.headers).get("authorization");
        return respondSummary();
      }
      if (url.includes("/categories?")) {
        return jsonResponse({ success: true, data: categories });
      }
      return jsonResponse({ success: true, data: [] });
    },
    { preconnect: (): void => {} },
  );

  return result;
}

function renderAnalytics(session: AuthSession): {
  memoryRouter: ReturnType<typeof createMemoryRouter>;
} {
  const analyticsLayout = productionRouter.routes.find((route) =>
    route.children?.some((child) => child.path === ANALYTICS_PATH),
  );
  const analyticsChild = analyticsLayout?.children?.find((route) => route.path === ANALYTICS_PATH);
  if (!analyticsLayout?.element || !analyticsChild?.element) {
    throw new Error("Production analytics route is unavailable");
  }

  const memoryRouter = createMemoryRouter(
    [
      {
        element: analyticsLayout.element,
        children: [{ path: ANALYTICS_PATH, element: analyticsChild.element }],
      },
      // Tujuan klik kategori; isinya tidak relevan untuk test ini.
      { path: DASHBOARD_PATH, element: <div data-testid="dashboard-stub" /> },
    ],
    { initialEntries: [ANALYTICS_PATH] },
  );

  render(
    <QueryClientProvider client={makeQueryClient()}>
      <AuthSessionProvider initialSession={session}>
        <RouterProvider router={memoryRouter} />
      </AuthSessionProvider>
    </QueryClientProvider>,
  );

  return { memoryRouter };
}

function analyticsRegion(): HTMLElement {
  return screen.getByRole("region", { name: ANALYTICS_REGION });
}

describe("Analytics Dashboard Integration (FE-S4-01 / AC-11.01, AC-11.02)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    cleanup();
    clearSession();
    globalThis.fetch = originalFetch;
  });

  test("AC-11.01: Head of Team sees a card with the total number of documents", async () => {
    const api = mockApi(() => jsonResponse({ success: true, data: summary }));

    await act(async () => {
      renderAnalytics(headSession);
    });

    expect(screen.getByRole("heading", { level: 1, name: ANALYTICS_REGION })).toBeTruthy();
    const card = await screen.findByRole("region", { name: "Total dokumen" });
    expect(within(card).getByText("1.284")).toBeTruthy();
    expect(api.analyticsAuthorization).toBe(`Bearer ${headSession.token}`);
  });

  test("AC-11.02: Head of Team sees a card with documents uploaded in the last 7 days", async () => {
    mockApi(() => jsonResponse({ success: true, data: summary }));

    await act(async () => {
      renderAnalytics(headSession);
    });

    const card = await screen.findByRole("region", { name: "Unggahan 7 hari terakhir" });
    expect(within(card).getByText("86")).toBeTruthy();
  });

  test("shows zero on both cards when the system has no documents", async () => {
    mockApi(() =>
      jsonResponse({ success: true, data: { totalDocuments: 0, uploadedLast7Days: 0 } }),
    );

    await act(async () => {
      renderAnalytics(headSession);
    });

    const total = await screen.findByRole("region", { name: "Total dokumen" });
    const recent = screen.getByRole("region", { name: "Unggahan 7 hari terakhir" });
    expect(within(total).getByText("0")).toBeTruthy();
    expect(within(recent).getByText("0")).toBeTruthy();
  });

  test("shows a loading status while the request is pending", async () => {
    mockApi(() => new Promise<Response>(() => undefined));

    await act(async () => {
      renderAnalytics(headSession);
    });

    expect(within(analyticsRegion()).getByRole("status").textContent).toContain(
      "Memuat data analitik",
    );
  });

  test("handles load error without leaking server details and allows retry", async () => {
    let failRequest = true;
    mockApi(() =>
      failRequest
        ? jsonResponse({ success: false, error: { message: "Detail internal server" } }, 500)
        : jsonResponse({ success: true, data: summary }),
    );

    await act(async () => {
      renderAnalytics(headSession);
    });

    const alert = await within(analyticsRegion()).findByRole("alert");
    expect(alert.textContent).toContain("Data analitik gagal dimuat.");
    expect(screen.queryByText("Detail internal server")).toBeNull();

    failRequest = false;
    await act(async () => {
      fireEvent.click(within(alert).getByRole("button", { name: "Coba lagi" }));
    });

    const card = await screen.findByRole("region", { name: "Total dokumen" });
    expect(within(card).getByText("1.284")).toBeTruthy();
  });

  test("renders inside the shared shell with the Head of Team menu and Analitik active", async () => {
    mockApi(() => jsonResponse({ success: true, data: summary }));

    await act(async () => {
      renderAnalytics(headSession);
    });

    expect(screen.getByTestId("analytics-page")).toBeTruthy();
    expect(screen.getByAltText("PERKASA")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Navigasi utama" });
    const dashboardLink = within(nav).getByRole("link", { name: "Dashboard" });
    const analyticsLink = within(nav).getByRole("link", { name: "Analitik" });
    expect(analyticsLink.getAttribute("aria-current")).toBe("page");
    expect(dashboardLink.getAttribute("aria-current")).toBeNull();
  });

  test("shows the category navigation and opens the dashboard filtered by the chosen category", async () => {
    mockApi(() => jsonResponse({ success: true, data: summary }), [reportingCategory]);

    let memoryRouter: ReturnType<typeof createMemoryRouter> | undefined;
    await act(async () => {
      memoryRouter = renderAnalytics(headSession).memoryRouter;
    });

    const categoryNav = screen.getByRole("region", { name: "Kategori" });
    const reportingButton = await within(categoryNav).findByRole("button", { name: "Reporting" });

    await act(async () => {
      fireEvent.click(reportingButton);
    });

    expect(memoryRouter?.state.location.pathname).toBe(DASHBOARD_PATH);
    expect(memoryRouter?.state.location.search).toBe(`?categoryId=${reportingCategory.id}`);
  });

  test("member_team cannot reach the analytics page and no analytics request is sent", async () => {
    const api = mockApi(() => jsonResponse({ success: true, data: summary }));

    await act(async () => {
      renderAnalytics(memberSession);
    });

    expect(screen.queryByRole("region", { name: "Total dokumen" })).toBeNull();
    expect(screen.queryByRole("heading", { name: ANALYTICS_REGION })).toBeNull();
    expect(api.analyticsRequests).toBe(0);
  });
});
