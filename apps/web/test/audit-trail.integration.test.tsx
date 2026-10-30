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

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
}

function renderAuditTrail(
  session: AuthSession,
  queryClient: QueryClient,
): ReturnType<typeof render> {
  const router = createMemoryRouter(productionRouter.routes, {
    initialEntries: ["/audit-trail"],
  });
  return render(
    <QueryClientProvider client={queryClient}>
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

  test("AC-12.01: Head of Team sees who downloaded what and when", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes("/audit/downloads")) {
        return new Response(JSON.stringify({ success: true, data: sampleAuditEvents }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: false }), { status: 404 });
    }) as typeof fetch;

    const queryClient = makeQueryClient();
    await act(async () => renderAuditTrail(headOfTeamSession, queryClient));

    expect(await screen.findByRole("heading", { name: "Audit Trail", level: 1 })).toBeTruthy();
    expect(screen.getByText("DocumentCustomer.pdf")).toBeTruthy();
    expect(screen.getByText("ProjectAnalysis.docx")).toBeTruthy();
    expect(screen.getByText("2 unduhan")).toBeTruthy();
    expect(screen.getByText("1 unduhan")).toBeTruthy();
  });

  test("opens document detail with user, document name and download timestamps", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes("/audit/downloads")) {
        return new Response(JSON.stringify({ success: true, data: sampleAuditEvents }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: false }), { status: 404 });
    }) as typeof fetch;

    await act(async () => renderAuditTrail(headOfTeamSession, makeQueryClient()));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /DocumentCustomer\.pdf/i }));
    });

    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByRole("heading", { name: "Detail Log" })).toBeTruthy();
    expect(within(drawer).getByText("DocumentCustomer.pdf")).toBeTruthy();
    expect(within(drawer).getByText("Aprisal Manuril")).toBeTruthy();
    expect(within(drawer).getByText("Fuaad Masadi")).toBeTruthy();
    expect(within(drawer).getAllByText(/18 Jun 2026/)).toHaveLength(2);

    await act(async () => {
      fireEvent.click(within(drawer).getByRole("button", { name: "Tutup detail log" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("filters documents by name or downloader", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes("/audit/downloads")) {
        return new Response(JSON.stringify({ success: true, data: sampleAuditEvents }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: false }), { status: 404 });
    }) as typeof fetch;

    await act(async () => renderAuditTrail(headOfTeamSession, makeQueryClient()));
    const searchInput = screen.getByPlaceholderText("Cari");
    expect(await screen.findByText("ProjectAnalysis.docx")).toBeTruthy();

    await act(async () => fireEvent.change(searchInput, { target: { value: "Customer" } }));
    expect(screen.getByText("DocumentCustomer.pdf")).toBeTruthy();
    expect(screen.queryByText("ProjectAnalysis.docx")).toBeNull();

    await act(async () => fireEvent.change(searchInput, { target: { value: "Bessie" } }));
    expect(screen.getByText("ProjectAnalysis.docx")).toBeTruthy();
    expect(screen.queryByText("DocumentCustomer.pdf")).toBeNull();

    await act(async () => fireEvent.change(searchInput, { target: { value: "not-found" } }));
    expect(screen.getByText("Tidak ada hasil untuk pencarian ini.")).toBeTruthy();
  });

  test("blocks member_team access to the audit route", async () => {
    await act(async () => renderAuditTrail(memberTeamSession, makeQueryClient()));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Akses Dibatasi")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Audit Trail" })).toBeNull();
  });

  test("shows a safe error and can retry the audit request", async () => {
    let callCount = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes("/audit/downloads")) {
        callCount += 1;
        if (callCount === 1) {
          return new Response(
            JSON.stringify({
              success: false,
              error: { code: "SERVER_ERROR", message: "private server detail" },
            }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ success: true, data: sampleAuditEvents }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: false }), { status: 404 });
    }) as typeof fetch;

    await act(async () => renderAuditTrail(headOfTeamSession, makeQueryClient()));
    expect(await screen.findByText("Riwayat unduhan gagal dimuat.")).toBeTruthy();
    expect(screen.queryByText("private server detail")).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Coba lagi" })));
    expect(await screen.findByText("DocumentCustomer.pdf")).toBeTruthy();
    expect(callCount).toBe(2);
  });
});
