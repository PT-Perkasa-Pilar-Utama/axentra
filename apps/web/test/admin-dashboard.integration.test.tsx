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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AdminSummary } from "@axentra/shared";
import type { AuthSession } from "../src/features/auth/session.storage";

// Modul berikut membaca `document`/`window` saat dimuat, jadi semuanya dimuat dinamis
// setelah Happy DOM terdaftar (pola yang sama dengan analytics.integration.test.tsx).
const { act, cleanup, fireEvent, render, screen, within } = await import("@testing-library/react");
const { createMemoryRouter, RouterProvider } = await import("react-router");
const { AuthSessionProvider } = await import("../src/features/auth/auth-session.context");
const { clearSession } = await import("../src/features/auth/session.storage");
const { AdminDashboardPage } = await import("../src/app/admin-dashboard.page");
const { ADMIN_USERS_PATH } = await import("../src/app/app-shell.menu");

const ADMIN_DASHBOARD_PATH = "/admin/dashboard";

const adminSession: AuthSession = {
  user: {
    id: "33333333-3333-4333-8333-333333333333",
    email: "admin@axentra.test",
    name: "Admin",
    role: "admin",
  },
  token: "ax_admin_session_token",
  rememberMe: false,
};

const summary: AdminSummary = {
  usersByRole: { member_team: 24, head_of_team: 5, admin: 2 },
  totalDocuments: 1284,
  uploadedLast7Days: 86,
  downloadCount: 312,
  // 02:15 UTC = 09:15 WIB
  latestDownloadAt: "2026-10-30T02:15:00.000Z",
};

type SummaryResponder = () => Response | Promise<Response>;

type MockApiResult = { summaryRequests: number; summaryAuthorization: string | null };

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function mockApi(respondSummary: SummaryResponder): MockApiResult {
  const result: MockApiResult = { summaryRequests: 0, summaryAuthorization: null };

  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes("/admin/summary")) {
        result.summaryRequests += 1;
        result.summaryAuthorization = new Headers(init?.headers).get("authorization");
        return respondSummary();
      }
      return jsonResponse({ success: true, data: [] });
    },
    { preconnect: (): void => {} },
  );

  return result;
}

function renderAdminDashboard(session: AuthSession): void {
  const memoryRouter = createMemoryRouter(
    [
      { path: ADMIN_DASHBOARD_PATH, element: <AdminDashboardPage /> },
      // Tujuan tautan "Kelola akun"; halamannya milik FE-S4-05.
      { path: ADMIN_USERS_PATH, element: <div data-testid="admin-users-stub" /> },
    ],
    { initialEntries: [ADMIN_DASHBOARD_PATH] },
  );

  render(
    <QueryClientProvider client={makeQueryClient()}>
      <AuthSessionProvider initialSession={session}>
        <RouterProvider router={memoryRouter} />
      </AuthSessionProvider>
    </QueryClientProvider>,
  );
}

/** Lebar isi bar peran dalam persen, dibaca dari style yang di-render. */
function readBarWidthPercent(roleId: string): number {
  return Number.parseFloat(screen.getByTestId(`admin-role-bar-${roleId}`).style.width);
}

describe("Admin Dashboard Integration (FE-S4-04 / PROP-ADM-AC-01)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    cleanup();
    clearSession();
    globalThis.fetch = originalFetch;
  });

  test("PROP-ADM-AC-01.01: shows users per role and their total", async () => {
    const api = mockApi(() => jsonResponse({ success: true, data: summary }));

    await act(async () => {
      renderAdminDashboard(adminSession);
    });

    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeTruthy();
    expect(screen.getByText("Ringkasan aktivitas sistem Axentra")).toBeTruthy();

    const total = await screen.findByRole("region", { name: "Total Pengguna" });
    expect(within(total).getByText("31")).toBeTruthy();
    expect(within(total).getByText("24 Member · 5 Head · 2 Admin")).toBeTruthy();

    const breakdown = screen.getByRole("region", { name: "Pengguna per Peran" });
    expect(within(breakdown).getByText("Member Team")).toBeTruthy();
    expect(within(breakdown).getByText("24")).toBeTruthy();
    expect(within(breakdown).getByText("Head of Team")).toBeTruthy();
    expect(within(breakdown).getByText("5")).toBeTruthy();
    expect(within(breakdown).getByText("Admin")).toBeTruthy();
    expect(within(breakdown).getByText("2")).toBeTruthy();
    expect(api.summaryAuthorization).toBe(`Bearer ${adminSession.token}`);
  });

  test("sizes each role bar by its share of all accounts", async () => {
    mockApi(() => jsonResponse({ success: true, data: summary }));

    await act(async () => {
      renderAdminDashboard(adminSession);
    });

    await screen.findByRole("region", { name: "Pengguna per Peran" });
    // 24, 5, dan 2 dari 31 akun.
    expect(readBarWidthPercent("member_team")).toBeCloseTo(77.42, 2);
    expect(readBarWidthPercent("head_of_team")).toBeCloseTo(16.13, 2);
    expect(readBarWidthPercent("admin")).toBeCloseTo(6.45, 2);
  });

  test("PROP-ADM-AC-01.02: shows total documents and uploads in the last 7 days", async () => {
    mockApi(() => jsonResponse({ success: true, data: summary }));

    await act(async () => {
      renderAdminDashboard(adminSession);
    });

    const documents = await screen.findByRole("region", { name: "Total Dokumen" });
    expect(within(documents).getByText("1.284")).toBeTruthy();
    expect(within(documents).getByText("Tidak termasuk yang dihapus")).toBeTruthy();

    const uploads = screen.getByRole("region", { name: "Unggahan 7 Hari" });
    expect(within(uploads).getByText("86")).toBeTruthy();
  });

  test("PROP-ADM-AC-01.03: shows total downloads and the latest download time", async () => {
    mockApi(() => jsonResponse({ success: true, data: summary }));

    await act(async () => {
      renderAdminDashboard(adminSession);
    });

    const downloads = await screen.findByRole("region", { name: "Total Unduhan" });
    expect(within(downloads).getByText("312")).toBeTruthy();
    expect(within(downloads).getByText("Terakhir diunduh 30 Okt 2026, 09.15")).toBeTruthy();
  });

  test("shows a no-download message when nothing has been downloaded yet", async () => {
    mockApi(() =>
      jsonResponse({
        success: true,
        data: { ...summary, downloadCount: 0, latestDownloadAt: null },
      }),
    );

    await act(async () => {
      renderAdminDashboard(adminSession);
    });

    const downloads = await screen.findByRole("region", { name: "Total Unduhan" });
    expect(within(downloads).getByText("0")).toBeTruthy();
    expect(within(downloads).getByText("Belum ada unduhan")).toBeTruthy();
  });

  test("shows zero everywhere when the system is empty", async () => {
    mockApi(() =>
      jsonResponse({
        success: true,
        data: {
          usersByRole: { member_team: 0, head_of_team: 0, admin: 0 },
          totalDocuments: 0,
          uploadedLast7Days: 0,
          downloadCount: 0,
          latestDownloadAt: null,
        },
      }),
    );

    await act(async () => {
      renderAdminDashboard(adminSession);
    });

    const users = await screen.findByRole("region", { name: "Total Pengguna" });
    expect(within(users).getByText("0 Member · 0 Head · 0 Admin")).toBeTruthy();
    const documents = screen.getByRole("region", { name: "Total Dokumen" });
    expect(within(documents).getByText("0")).toBeTruthy();

    // Tanpa akun, bar harus 0%, bukan NaN dari pembagian dengan nol.
    expect(readBarWidthPercent("member_team")).toBe(0);
    expect(readBarWidthPercent("head_of_team")).toBe(0);
    expect(readBarWidthPercent("admin")).toBe(0);
  });

  test("links to account management from the role breakdown", async () => {
    mockApi(() => jsonResponse({ success: true, data: summary }));

    await act(async () => {
      renderAdminDashboard(adminSession);
    });

    const link = await screen.findByRole("link", { name: "Kelola akun →" });
    expect(link.getAttribute("href")).toBe(ADMIN_USERS_PATH);
  });

  test("shows when the data was last updated after loading", async () => {
    mockApi(() => jsonResponse({ success: true, data: summary }));

    await act(async () => {
      renderAdminDashboard(adminSession);
    });

    expect(await screen.findByText(/^Diperbarui /)).toBeTruthy();
  });

  test("shows a loading status while the request is pending", async () => {
    mockApi(() => new Promise<Response>(() => undefined));

    await act(async () => {
      renderAdminDashboard(adminSession);
    });

    expect(screen.getByRole("status", { name: "Memuat data dasbor admin" })).toBeTruthy();
  });

  test("handles load error without leaking server details and allows retry", async () => {
    let failRequest = true;
    mockApi(() =>
      failRequest
        ? jsonResponse({ success: false, error: { message: "Detail internal server" } }, 500)
        : jsonResponse({ success: true, data: summary }),
    );

    await act(async () => {
      renderAdminDashboard(adminSession);
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Data dasbor gagal dimuat.");
    expect(screen.queryByText("Detail internal server")).toBeNull();

    failRequest = false;
    await act(async () => {
      fireEvent.click(within(alert).getByRole("button", { name: "Coba lagi" }));
    });

    const total = await screen.findByRole("region", { name: "Total Pengguna" });
    expect(within(total).getByText("31")).toBeTruthy();
  });

  test("retries a transient 500 once before showing the error", async () => {
    const api = mockApi(() =>
      jsonResponse({ success: false, error: { code: "SERVER_ERROR", message: "private" } }, 500),
    );

    await act(async () => {
      renderAdminDashboard(adminSession);
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Data dasbor gagal dimuat.");
    expect(screen.queryByText("private")).toBeNull();
    expect(api.summaryRequests).toBe(2);
  });

  test("403 shows an error without retrying or leaking server details", async () => {
    const api = mockApi(() =>
      jsonResponse({ success: false, error: { code: "FORBIDDEN", message: "private" } }, 403),
    );

    await act(async () => {
      renderAdminDashboard(adminSession);
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Data dasbor gagal dimuat.");
    expect(screen.queryByText("private")).toBeNull();
    expect(api.summaryRequests).toBe(1);
  });
});
