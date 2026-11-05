import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AuthSessionProvider } from "../src/features/auth/auth-session.context";
import { clearSession, type AuthSession } from "../src/features/auth/session.storage";
import { router as productionRouter } from "../src/app/router";
import type { AdminDocument } from "../src/features/admin-documents/admin-documents.api";

const adminSession: AuthSession = {
  user: {
    id: "99999999-9999-4999-8999-999999999999",
    email: "admin@axentra.test",
    name: "Admin User",
    role: "admin",
  },
  token: "ax_admin_token",
  rememberMe: false,
};

const memberSession: AuthSession = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "member@axentra.test",
    name: "Member User",
    role: "member_team",
  },
  token: "ax_member_token",
  rememberMe: false,
};

const sampleDocs: AdminDocument[] = [
  {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    title: "Laporan-Q1-2026.pdf",
    ownerId: "22222222-2222-4222-8222-222222222222",
    ownerName: "Rina Pratama",
    uploadedAt: "2026-04-17T08:00:00.000Z",
    archivedAt: null,
  },
  {
    id: "bbbbbbbb-2222-4222-8222-222222222222",
    title: "Legacy-Document.docx",
    ownerId: null,
    ownerName: null,
    uploadedAt: "2026-03-10T10:00:00.000Z",
    archivedAt: null,
  },
  {
    id: "cccccccc-3333-4333-8333-333333333333",
    title: "Arsip-Lama.pdf",
    ownerId: "22222222-2222-4222-8222-222222222222",
    ownerName: "Rina Pratama",
    uploadedAt: "2026-01-01T08:00:00.000Z",
    archivedAt: "2026-02-01T08:00:00.000Z",
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

function renderAdminDocuments(
  session: AuthSession,
  queryClient = makeQueryClient(),
): ReturnType<typeof render> {
  const memoryRouter = createMemoryRouter(productionRouter.routes, {
    initialEntries: ["/admin/documents"],
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthSessionProvider initialSession={session}>
        <RouterProvider router={memoryRouter} />
      </AuthSessionProvider>
    </QueryClientProvider>,
  );
}

describe("Admin Documents Feature (FE-S4-06 / PROP-ADM-AC-03)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    cleanup();
    clearSession();
    globalThis.fetch = originalFetch;
  });

  test("AC-03.01: displays document list with title, owner, and status", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/admin/documents")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: sampleDocs,
            meta: { page: 1, limit: 20, total: 3 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ success: false }), { status: 404 });
    }) as unknown as typeof fetch;

    renderAdminDocuments(adminSession);

    expect(await screen.findByRole("heading", { name: "Manajemen Dokumen" })).toBeTruthy();
    expect(screen.getByText("Laporan-Q1-2026.pdf")).toBeTruthy();
    expect(screen.getByText("Rina Pratama")).toBeTruthy();
    expect(screen.getByText("Legacy-Document.docx")).toBeTruthy();
    expect(screen.getByText("Tidak diketahui")).toBeTruthy();
  });

  test("AC-03.01 & AC-03.05: switches to archived tab and shows unarchive action", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/admin/documents")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: sampleDocs,
            meta: { page: 1, limit: 20, total: 3 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ success: false }), { status: 404 });
    }) as unknown as typeof fetch;

    renderAdminDocuments(adminSession);
    expect(await screen.findByRole("heading", { name: "Manajemen Dokumen" })).toBeTruthy();

    const archivedTab = screen.getByRole("tab", { name: /Diarsipkan/ });
    act(() => {
      fireEvent.click(archivedTab);
    });

    expect(screen.getByText("Arsip-Lama.pdf")).toBeTruthy();
    const unarchiveBtn = screen.getByRole("button", {
      name: "Batalkan arsip dokumen Arsip-Lama.pdf",
    });
    expect(unarchiveBtn).toBeTruthy();
  });

  test("AC-03.03: archive button triggers archive mutation", async () => {
    let archiveCalled = false;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (
        init?.method === "POST" &&
        url.includes("/admin/documents/aaaaaaaa-1111-4111-8111-111111111111/archive")
      ) {
        archiveCalled = true;
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: "aaaaaaaa-1111-4111-8111-111111111111",
              archivedAt: "2026-11-04T00:00:00.000Z",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/admin/documents")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: sampleDocs,
            meta: { page: 1, limit: 20, total: 3 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ success: false }), { status: 404 });
    }) as unknown as typeof fetch;

    renderAdminDocuments(adminSession);
    expect(await screen.findByRole("heading", { name: "Manajemen Dokumen" })).toBeTruthy();

    const archiveBtn = screen.getByRole("button", { name: "Arsipkan dokumen Laporan-Q1-2026.pdf" });
    act(() => {
      fireEvent.click(archiveBtn);
    });

    const confirmBtn = screen.getByRole("button", { name: "Arsipkan Dokumen" });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(archiveCalled).toBe(true);
  });

  test("AC-03.05: unarchive button triggers unarchive mutation", async () => {
    let unarchiveCalled = false;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (
        init?.method === "POST" &&
        url.includes("/admin/documents/cccccccc-3333-4333-8333-333333333333/unarchive")
      ) {
        unarchiveCalled = true;
        return new Response(
          JSON.stringify({
            success: true,
            data: { id: "cccccccc-3333-4333-8333-333333333333", archivedAt: null },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/admin/documents")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: sampleDocs,
            meta: { page: 1, limit: 20, total: 3 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ success: false }), { status: 404 });
    }) as unknown as typeof fetch;

    renderAdminDocuments(adminSession);
    expect(await screen.findByRole("heading", { name: "Manajemen Dokumen" })).toBeTruthy();

    const archivedTab = screen.getByRole("tab", { name: /Diarsipkan/ });
    act(() => {
      fireEvent.click(archivedTab);
    });

    const unarchiveBtn = screen.getByRole("button", {
      name: "Batalkan arsip dokumen Arsip-Lama.pdf",
    });
    act(() => {
      fireEvent.click(unarchiveBtn);
    });

    const confirmBtn = screen.getByRole("button", { name: "Batalkan Arsip" });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(unarchiveCalled).toBe(true);
  });

  test("AC-03.04: soft delete confirmation dialog flow", async () => {
    let deleteCalled = false;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (
        init?.method === "DELETE" &&
        url.includes("/admin/documents/aaaaaaaa-1111-4111-8111-111111111111")
      ) {
        deleteCalled = true;
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: "aaaaaaaa-1111-4111-8111-111111111111",
              deletedAt: "2026-11-04T00:00:00.000Z",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/admin/documents")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: sampleDocs,
            meta: { page: 1, limit: 20, total: 3 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ success: false }), { status: 404 });
    }) as unknown as typeof fetch;

    renderAdminDocuments(adminSession);
    expect(await screen.findByRole("heading", { name: "Manajemen Dokumen" })).toBeTruthy();

    const deleteBtn = screen.getByRole("button", { name: "Hapus dokumen Laporan-Q1-2026.pdf" });
    fireEvent.click(deleteBtn);

    expect(screen.getByRole("heading", { name: /Hapus “Laporan-Q1-2026\.pdf”\?/ })).toBeTruthy();
    expect(screen.getByText(/Data tetap tersimpan di server sebagai hapus lunak/)).toBeTruthy();

    const confirmBtn = screen.getByRole("button", { name: "Hapus Dokumen" });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(deleteCalled).toBe(true);
  });

  test("AC-03.02: document detail dialog shows metadata without preview/download", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/admin/documents/aaaaaaaa-1111-4111-8111-111111111111")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              ...sampleDocs[0],
              categoryId: "33333333-3333-4333-8333-333333333333",
              categoryName: "Keuangan",
              metadata: { author: "Dr. Siti Rahma", extractedAt: "2026-04-17T08:05:00.000Z" },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/admin/documents")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: sampleDocs,
            meta: { page: 1, limit: 20, total: 3 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ success: false }), { status: 404 });
    }) as unknown as typeof fetch;

    renderAdminDocuments(adminSession);
    expect(await screen.findByRole("heading", { name: "Manajemen Dokumen" })).toBeTruthy();

    const titleBtn = screen.getByRole("button", { name: "Laporan-Q1-2026.pdf" });
    await act(async () => {
      fireEvent.click(titleBtn);
    });

    expect(await screen.findByText("Detail Metadata Dokumen")).toBeTruthy();
    expect(screen.getByText("Keuangan")).toBeTruthy();
    expect(screen.getByText("Dr. Siti Rahma")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /unduh|download/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /unduh|download|pratinjau|preview/i })).toBeNull();
  });

  test("Route gate: member_team is redirected away from /admin/documents", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    renderAdminDocuments(memberSession);

    expect(screen.queryByRole("heading", { name: "Manajemen Dokumen" })).toBeNull();
    expect(screen.getByText("Akses Dibatasi")).toBeTruthy();
  });

  test("Error handling: 500 error shows retry button and clicking it retries", async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      if (callCount <= 2) {
        return new Response(JSON.stringify({ success: false }), { status: 500 });
      }
      return new Response(
        JSON.stringify({ success: true, data: sampleDocs, meta: { page: 1, limit: 20, total: 3 } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    renderAdminDocuments(adminSession);

    expect(await screen.findByText("Daftar dokumen gagal dimuat.")).toBeTruthy();
    const retryBtn = screen.getByRole("button", { name: "Coba lagi" });
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    expect(await screen.findByText("Laporan-Q1-2026.pdf")).toBeTruthy();
  });
});
