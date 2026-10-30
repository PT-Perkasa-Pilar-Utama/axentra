import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { DownloadAuditEvent } from "@axentra/shared";
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

const sampleAuditEvents: DownloadAuditEvent[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "aaaaaaaa-1111-4111-8111-111111111111",
    userName: "Aprisal Manuril",
    userEmail: "aprisal@axentra.test",
    documentId: "bbbbbbbb-1111-4111-8111-111111111111",
    documentName: "DocumentCustomer.pdf",
    downloadedAt: "2026-06-18T09:34:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    userId: "aaaaaaaa-2222-4222-8222-222222222222",
    userName: "Fuaad Masadi",
    userEmail: "fuaad@axentra.test",
    documentId: "bbbbbbbb-1111-4111-8111-111111111111",
    documentName: "DocumentCustomer.pdf",
    downloadedAt: "2026-06-18T03:34:00.000Z",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    userId: "aaaaaaaa-3333-4333-8333-333333333333",
    userName: "Bessie Cooper",
    userEmail: "bessie@axentra.test",
    documentId: "bbbbbbbb-2222-4222-8222-222222222222",
    documentName: "ProjectAnalysis.docx",
    downloadedAt: "2026-01-22T10:00:00.000Z",
  },
];

function sampleEventAt(index: number): DownloadAuditEvent {
  const event = sampleAuditEvents[index];
  if (!event) throw new Error(`Missing audit test fixture at index ${index}`);
  return event;
}

function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
}

function mockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return Object.assign(handler, { preconnect: (): void => {} });
}

function renderAuditTrail(session: AuthSession): ReturnType<typeof render> {
  const router = createMemoryRouter(productionRouter.routes, { initialEntries: ["/audit-trail"] });
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <AuthSessionProvider initialSession={session}>
        <RouterProvider router={router} />
      </AuthSessionProvider>
    </QueryClientProvider>,
  );
}

describe("Audit Trail Feature (FE-S4-02 / AC-12.01)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    cleanup();
    clearSession();
    globalThis.fetch = originalFetch;
  });

  test("AC-12.01: the table displays downloader, document, and time on page load", async () => {
    globalThis.fetch = mockFetch(async (input: RequestInfo | URL) =>
      String(input).includes("/audit/downloads")
        ? new Response(JSON.stringify({ success: true, data: sampleAuditEvents }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        : new Response(JSON.stringify({ success: false }), { status: 404 }),
    );

    renderAuditTrail(headOfTeamSession);
    const table = await screen.findByRole("table", { name: "Riwayat Unduhan Dokumen" });
    const rows = within(table).getAllByRole("row");

    expect(rows).toHaveLength(4);
    expect(within(table).getByRole("columnheader", { name: "Pengguna" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Nama Dokumen" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Waktu Unduh" })).toBeTruthy();
    expect(within(table).getByText("Aprisal Manuril")).toBeTruthy();
    expect(within(table).getByText("Fuaad Masadi")).toBeTruthy();
    expect(within(table).getAllByText("DocumentCustomer.pdf")).toHaveLength(2);
    expect(within(table).getByText("ProjectAnalysis.docx")).toBeTruthy();
    expect(within(table).getByText("18/06/2026 16:34 WIB")).toBeTruthy();
    expect(within(table).getByText("18/06/2026 10:34 WIB")).toBeTruthy();
  });

  test("search matches document name, downloader name, and email", async () => {
    globalThis.fetch = mockFetch(
      async () =>
        new Response(JSON.stringify({ success: true, data: sampleAuditEvents }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    renderAuditTrail(headOfTeamSession);
    const table = await screen.findByRole("table", { name: "Riwayat Unduhan Dokumen" });
    const input = screen.getByPlaceholderText("Cari dokumen atau pengguna...");

    await act(async () => fireEvent.change(input, { target: { value: "aprisal@axentra.test" } }));
    expect(within(table).getByText("Aprisal Manuril")).toBeTruthy();
    expect(within(table).queryByText("Fuaad Masadi")).toBeNull();

    await act(async () => fireEvent.change(input, { target: { value: "ProjectAnalysis" } }));
    expect(within(table).getByText("Bessie Cooper")).toBeTruthy();
    expect(within(table).queryByText("Aprisal Manuril")).toBeNull();
  });

  test("paginates events and reports counts using configured page size", async () => {
    const events = Array.from({ length: 11 }, (_, index) => ({
      ...sampleEventAt(0),
      id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
      documentId: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`,
      documentName: `Document-${index}.pdf`,
    }));
    globalThis.fetch = mockFetch(
      async () =>
        new Response(JSON.stringify({ success: true, data: events }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    renderAuditTrail(headOfTeamSession);
    expect(await screen.findByText("Menampilkan 1–10 dari 11 aktivitas unduhan")).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Halaman berikutnya" })),
    );
    expect(screen.getByText("Menampilkan 11–11 dari 11 aktivitas unduhan")).toBeTruthy();
  });

  test("keeps separate events with duplicate document names when document IDs are absent", async () => {
    const events: DownloadAuditEvent[] = [
      { ...sampleEventAt(0), id: "44444444-4444-4444-8444-444444444444", documentId: null },
      { ...sampleEventAt(1), id: "55555555-5555-4555-8555-555555555555", documentId: null },
    ];
    globalThis.fetch = mockFetch(
      async () =>
        new Response(JSON.stringify({ success: true, data: events }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    renderAuditTrail(headOfTeamSession);
    const table = await screen.findByRole("table", { name: "Riwayat Unduhan Dokumen" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getAllByText("DocumentCustomer.pdf")).toHaveLength(2);
  });

  test("shows access denied for API 403 without retry or server detail", async () => {
    globalThis.fetch = mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            error: { code: "FORBIDDEN", message: "private detail" },
          }),
          { status: 403, headers: { "content-type": "application/json" } },
        ),
    );

    renderAuditTrail(headOfTeamSession);
    expect(
      await screen.findByText("Anda tidak memiliki izin untuk melihat riwayat unduhan."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Coba lagi" })).toBeNull();
    expect(screen.queryByText("private detail")).toBeNull();
  });

  test("blocks member_team access at the route without sending an audit request", async () => {
    let requestCount = 0;
    globalThis.fetch = mockFetch(async () => {
      requestCount += 1;
      return new Response(JSON.stringify({ success: true, data: sampleAuditEvents }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    renderAuditTrail(memberTeamSession);
    expect(screen.getByText("Akses Dibatasi")).toBeTruthy();
    expect(requestCount).toBe(0);
  });

  test("blocks admin access at the route without sending an audit request", async () => {
    let requestCount = 0;
    globalThis.fetch = mockFetch(async () => {
      requestCount += 1;
      return new Response(JSON.stringify({ success: true, data: sampleAuditEvents }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    renderAuditTrail(adminSession);
    expect(screen.getByText("Akses Dibatasi")).toBeTruthy();
    expect(requestCount).toBe(0);
  });

  test("shows safe error and retries a transient audit API failure", async () => {
    let calls = 0;
    globalThis.fetch = mockFetch(async () => {
      calls += 1;
      return calls === 1
        ? new Response(
            JSON.stringify({ success: false, error: { code: "SERVER_ERROR", message: "private" } }),
            { status: 500, headers: { "content-type": "application/json" } },
          )
        : new Response(JSON.stringify({ success: true, data: sampleAuditEvents }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
    });

    renderAuditTrail(headOfTeamSession);
    expect(await screen.findByText("Riwayat unduhan gagal dimuat.")).toBeTruthy();
    expect(screen.queryByText("private")).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Coba lagi" })));
    expect(await screen.findByRole("table", { name: "Riwayat Unduhan Dokumen" })).toBeTruthy();
    expect(calls).toBe(2);
  });
});
