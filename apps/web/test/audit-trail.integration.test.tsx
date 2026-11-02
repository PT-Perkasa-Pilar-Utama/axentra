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
function auditPageResponse(
  items: DownloadAuditEvent[],
  meta: { page: number; limit: number; total: number },
): Response {
  return new Response(JSON.stringify({ success: true, data: items, meta }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
function matchingEventsForPage(page: number, limit: number): DownloadAuditEvent[] {
  const allEvents = Array.from({ length: 25 }, (_, index) => ({
    ...sampleEventAt(0),
    id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
    documentId: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`,
    documentName: `Document-${index}.pdf`,
    downloadedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  }));
  return allEvents.slice((page - 1) * limit, page * limit);
}
type RequestedAuditPage = { page: number; limit: number };
function readAuditPageRequest(input: RequestInfo | URL): RequestedAuditPage {
  const url = new URL(String(input), "http://localhost");
  return {
    page: Number(url.searchParams.get("page")),
    limit: Number(url.searchParams.get("limit")),
  };
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

  test("AC-12.01: cards show downloader, document, and download time", async () => {
    globalThis.fetch = mockFetch(async (input) => {
      const { page, limit } = readAuditPageRequest(input);
      return auditPageResponse(sampleAuditEvents.slice((page - 1) * limit, page * limit), {
        page,
        limit,
        total: sampleAuditEvents.length,
      });
    });
    renderAuditTrail(headOfTeamSession);
    expect(await screen.findByRole("heading", { name: "Auditrail" })).toBeTruthy();
    const list = screen.getByLabelText("Daftar aktivitas unduhan");
    expect(within(list).getAllByRole("button")).toHaveLength(2);
    expect(within(list).getByText("DocumentCustomer.pdf")).toBeTruthy();
    expect(within(list).getByText("ProjectAnalysis.docx")).toBeTruthy();
    expect(within(list).getByText("18/06/2026 16:34 WIB")).toBeTruthy();
    expect(within(list).getByText("22/01/2026 17:00 WIB")).toBeTruthy();
  });

  test("opens and closes the Log Detail drawer, retaining every download event", async () => {
    globalThis.fetch = mockFetch(async () =>
      auditPageResponse(sampleAuditEvents, {
        page: 1,
        limit: 10,
        total: sampleAuditEvents.length,
      }),
    );
    renderAuditTrail(headOfTeamSession);
    const list = await screen.findByLabelText("Daftar aktivitas unduhan");
    const cards = within(list).getAllByRole("button");
    const firstCard = cards[0];
    if (!firstCard) throw new Error("Missing audit card");
    await act(async () => fireEvent.click(firstCard));
    const drawer = await screen.findByRole("dialog", { name: "Log Detail" });
    const closeButton = within(drawer).getByRole("button", { name: "Tutup detail log" });
    expect(document.activeElement).toBe(closeButton);
    expect(within(drawer).getByText("File Name")).toBeTruthy();
    expect(within(drawer).getByText("DocumentCustomer.pdf")).toBeTruthy();
    expect(within(drawer).getByText("Download Log")).toBeTruthy();
    expect(within(drawer).getByText("Aprisal Manuril")).toBeTruthy();
    expect(within(drawer).getByText("Fuaad Masadi")).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Tutup detail log" })),
    );
    expect(screen.queryByRole("dialog", { name: "Log Detail" })).toBeNull();
    expect(document.activeElement).toBe(firstCard);
  });

  test("traps Tab focus inside drawer, locks scroll, and returns focus on Escape", async () => {
    globalThis.fetch = mockFetch(async () =>
      auditPageResponse(sampleAuditEvents, {
        page: 1,
        limit: 10,
        total: sampleAuditEvents.length,
      }),
    );
    renderAuditTrail(headOfTeamSession);
    const list = await screen.findByLabelText("Daftar aktivitas unduhan");
    const cards = within(list).getAllByRole("button");
    const card = cards[0];
    if (!card) throw new Error("Missing audit card");
    await act(async () => fireEvent.click(card));
    const drawer = await screen.findByRole("dialog", { name: "Log Detail" });
    const closeButton = within(drawer).getByRole("button", { name: "Tutup detail log" });
    expect(document.activeElement).toBe(closeButton);
    expect(document.body.style.overflow).toBe("hidden");

    await act(async () => fireEvent.keyDown(window, { key: "Tab" }));
    expect(document.activeElement).toBe(closeButton);
    await act(async () => fireEvent.keyDown(window, { key: "Tab", shiftKey: true }));
    expect(document.activeElement).toBe(closeButton);

    await act(async () => fireEvent.keyDown(window, { key: "Escape" }));
    expect(screen.queryByRole("dialog", { name: "Log Detail" })).toBeNull();
    expect(document.activeElement).toBe(card);
    expect(document.body.style.overflow).toBe("");
  });

  test("search matches document name, downloader name, and email on the loaded server page", async () => {
    globalThis.fetch = mockFetch(async () =>
      auditPageResponse(sampleAuditEvents, {
        page: 1,
        limit: 10,
        total: sampleAuditEvents.length,
      }),
    );
    renderAuditTrail(headOfTeamSession);
    const list = await screen.findByLabelText("Daftar aktivitas unduhan");
    const input = screen.getByPlaceholderText("Search");
    await act(async () => fireEvent.change(input, { target: { value: "aprisal@axentra.test" } }));
    expect(within(list).getByText("DocumentCustomer.pdf")).toBeTruthy();
    expect(within(list).queryByText("ProjectAnalysis.docx")).toBeNull();
    await act(async () => fireEvent.change(input, { target: { value: "ProjectAnalysis" } }));
    expect(within(list).getByText("ProjectAnalysis.docx")).toBeTruthy();
    expect(within(list).queryByText("DocumentCustomer.pdf")).toBeNull();
  });

  test("F17: requests server pages and updates navigation using response metadata", async () => {
    let lastRequestedPage = 1;
    let lastRequestedLimit = 10;
    globalThis.fetch = mockFetch(async (input) => {
      const { page, limit } = readAuditPageRequest(input);
      lastRequestedPage = page;
      lastRequestedLimit = limit;
      return auditPageResponse(matchingEventsForPage(page, limit), { page, limit, total: 25 });
    });
    renderAuditTrail(headOfTeamSession);
    expect(await screen.findByText("Menampilkan 1–10 dari 25 aktivitas unduhan")).toBeTruthy();
    expect(lastRequestedPage).toBe(1);
    expect(lastRequestedLimit).toBe(10);
    const next = screen.getByRole("button", { name: "Halaman berikutnya" });
    const previous = screen.getByRole("button", { name: "Halaman sebelumnya" });
    expect(previous.hasAttribute("disabled")).toBe(true);
    await act(async () => fireEvent.click(next));
    expect(await screen.findByText("Menampilkan 11–20 dari 25 aktivitas unduhan")).toBeTruthy();
    expect(lastRequestedPage).toBe(2);
    await act(async () => fireEvent.click(next));
    expect(await screen.findByText("Menampilkan 21–25 dari 25 aktivitas unduhan")).toBeTruthy();
    expect(lastRequestedPage).toBe(3);
    expect(next.hasAttribute("disabled")).toBe(true);
  });

  test("F17: supports audit histories beyond 100 items", async () => {
    let requestedPage = 1;
    globalThis.fetch = mockFetch(async (input) => {
      const { page, limit } = readAuditPageRequest(input);
      requestedPage = page;
      const count = Math.min(limit, 105 - (page - 1) * limit);
      const events = Array.from({ length: count }, (_, index) => ({
        ...sampleEventAt(0),
        id: `11111111-1111-4111-8111-${String((page - 1) * limit + index).padStart(12, "0")}`,
        documentName: `Document-${(page - 1) * limit + index}.pdf`,
      }));
      return auditPageResponse(events, { page, limit, total: 105 });
    });
    renderAuditTrail(headOfTeamSession);
    expect(await screen.findByText("Menampilkan 1–10 dari 105 aktivitas unduhan")).toBeTruthy();
    const next = screen.getByRole("button", { name: "Halaman berikutnya" });
    for (let page = 2; page <= 11; page += 1) {
      await act(async () => fireEvent.click(next));
      const first = (page - 1) * 10 + 1;
      const last = Math.min(page * 10, 105);
      expect(
        await screen.findByText(`Menampilkan ${first}–${last} dari 105 aktivitas unduhan`),
      ).toBeTruthy();
      expect(requestedPage).toBe(page);
    }
    expect(screen.getByText("Document-100.pdf")).toBeTruthy();
    expect(next.hasAttribute("disabled")).toBe(true);
  });

  test("403 is access denied without retry or leaking server detail", async () => {
    let calls = 0;
    globalThis.fetch = mockFetch(async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ success: false, error: { code: "FORBIDDEN", message: "private" } }),
        {
          status: 403,
          headers: { "content-type": "application/json" },
        },
      );
    });
    renderAuditTrail(headOfTeamSession);
    expect(
      await screen.findByText("Anda tidak memiliki izin untuk melihat riwayat unduhan."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Coba lagi" })).toBeNull();
    expect(screen.queryByText("private")).toBeNull();
    expect(calls).toBe(1);
  });

  test.each([
    ["member_team", memberTeamSession],
    ["admin", adminSession],
  ])("route blocks %s without an API request", (_role, session) => {
    let calls = 0;
    globalThis.fetch = mockFetch(async () => {
      calls += 1;
      return auditPageResponse(sampleAuditEvents, {
        page: 1,
        limit: 10,
        total: sampleAuditEvents.length,
      });
    });
    renderAuditTrail(session);
    expect(screen.getByText("Akses Dibatasi")).toBeTruthy();
    expect(calls).toBe(0);
  });

  test("shows safe transient failure and manual retry", async () => {
    let calls = 0;
    globalThis.fetch = mockFetch(async () => {
      calls += 1;
      return calls <= 2
        ? new Response(
            JSON.stringify({ success: false, error: { code: "SERVER_ERROR", message: "private" } }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            },
          )
        : auditPageResponse(sampleAuditEvents, {
            page: 1,
            limit: 10,
            total: sampleAuditEvents.length,
          });
    });
    renderAuditTrail(headOfTeamSession);
    expect(await screen.findByText("Riwayat unduhan gagal dimuat.")).toBeTruthy();
    expect(screen.queryByText("private")).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Coba lagi" })));
    expect(await screen.findByLabelText("Daftar aktivitas unduhan")).toBeTruthy();
    expect(calls).toBe(3);
  });
});
