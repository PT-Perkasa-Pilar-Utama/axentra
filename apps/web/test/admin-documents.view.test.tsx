import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AuthSessionProvider } from "../src/features/auth/auth-session.context";
import { clearSession, type AuthSession } from "../src/features/auth/session.storage";
import { router as productionRouter } from "../src/app/router";
import { resolveShellRole, ROLE_MENU } from "../src/app/app-shell.menu";
import type { AdminDocument } from "../src/features/admin-documents/admin-documents.api";
import { createDeferred } from "./auth-test-support";

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

const headOfTeamSession: AuthSession = {
  user: {
    id: "77777777-7777-4777-8777-777777777777",
    email: "head@axentra.test",
    name: "Head of Team User",
    role: "head_of_team",
  },
  token: "ax_head_token",
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

function mockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return Object.assign(handler, { preconnect: (): void => {} });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
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
    globalThis.fetch = mockFetch(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/admin/documents")) {
        return jsonResponse({
          success: true,
          data: sampleDocs,
          meta: { page: 1, limit: 20, total: 3 },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

    renderAdminDocuments(adminSession);

    expect(await screen.findByRole("heading", { name: "Manajemen Dokumen" })).toBeTruthy();
    expect(screen.getByText("Laporan-Q1-2026.pdf")).toBeTruthy();
    expect(screen.getByText("Rina Pratama")).toBeTruthy();
    expect(screen.getByText("Legacy-Document.docx")).toBeTruthy();
    expect(screen.getByText("Tidak diketahui")).toBeTruthy();
  });

  test("Loading state: shows loading indicator while document list is pending", async () => {
    const listDeferred = createDeferred<Response>();
    globalThis.fetch = mockFetch(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/admin/documents")) {
        return listDeferred.promise;
      }
      return jsonResponse({ success: false }, 404);
    });

    renderAdminDocuments(adminSession);

    expect(screen.getByRole("status").textContent).toBe("Memuat daftar dokumen...");

    listDeferred.resolve(
      jsonResponse({
        success: true,
        data: sampleDocs,
        meta: { page: 1, limit: 20, total: 3 },
      }),
    );

    expect(await screen.findByRole("heading", { name: "Manajemen Dokumen" })).toBeTruthy();
    expect(screen.queryByText("Memuat daftar dokumen...")).toBeNull();
  });

  test("AC-03.01 & AC-03.05: switches to archived tab and shows unarchive action", async () => {
    globalThis.fetch = mockFetch(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/admin/documents")) {
        return jsonResponse({
          success: true,
          data: sampleDocs,
          meta: { page: 1, limit: 20, total: 3 },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

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

  test("AC-03.03: archive button triggers mutation with pending state and prevents double click", async () => {
    let archiveCalls = 0;
    const archiveDeferred = createDeferred<Response>();

    globalThis.fetch = mockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (
        init?.method === "POST" &&
        url.includes("/admin/documents/aaaaaaaa-1111-4111-8111-111111111111/archive")
      ) {
        archiveCalls++;
        return archiveDeferred.promise;
      }
      if (url.includes("/admin/documents")) {
        return jsonResponse({
          success: true,
          data: sampleDocs,
          meta: { page: 1, limit: 20, total: 3 },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

    renderAdminDocuments(adminSession);
    expect(await screen.findByRole("heading", { name: "Manajemen Dokumen" })).toBeTruthy();

    const archiveBtn = screen.getByRole("button", {
      name: "Arsipkan dokumen Laporan-Q1-2026.pdf",
    });
    act(() => {
      fireEvent.click(archiveBtn);
    });

    const confirmBtn = screen.getByRole("button", { name: "Arsipkan Dokumen" });
    const cancelBtn = screen.getByRole("button", { name: "Batal" });

    // Klik pertama memicu mutasi
    act(() => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(archiveCalls).toBe(1);
      expect(confirmBtn.textContent).toBe("Memproses...");
      expect(confirmBtn.hasAttribute("disabled")).toBe(true);
      expect(cancelBtn.hasAttribute("disabled")).toBe(true);
    });

    // Klik kedua dicegah saat pending
    act(() => {
      fireEvent.click(confirmBtn);
    });
    expect(archiveCalls).toBe(1);

    // Selesaikan mutasi
    await act(async () => {
      archiveDeferred.resolve(
        jsonResponse({
          success: true,
          data: {
            id: "aaaaaaaa-1111-4111-8111-111111111111",
            archivedAt: "2026-11-04T00:00:00.000Z",
          },
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: /Arsipkan “Laporan-Q1-2026\.pdf”\?/ }),
      ).toBeNull();
    });
  });

  test("AC-03.03: archive 403 error displays permission alert in dialog", async () => {
    globalThis.fetch = mockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (
        init?.method === "POST" &&
        url.includes("/admin/documents/aaaaaaaa-1111-4111-8111-111111111111/archive")
      ) {
        return jsonResponse({ success: false, message: "Forbidden" }, 403);
      }
      if (url.includes("/admin/documents")) {
        return jsonResponse({
          success: true,
          data: sampleDocs,
          meta: { page: 1, limit: 20, total: 3 },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

    renderAdminDocuments(adminSession);
    expect(await screen.findByRole("heading", { name: "Manajemen Dokumen" })).toBeTruthy();

    const archiveBtn = screen.getByRole("button", {
      name: "Arsipkan dokumen Laporan-Q1-2026.pdf",
    });
    act(() => {
      fireEvent.click(archiveBtn);
    });

    const confirmBtn = screen.getByRole("button", { name: "Arsipkan Dokumen" });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(
      await screen.findByText("Anda tidak memiliki izin untuk mengarsipkan dokumen."),
    ).toBeTruthy();
  });

  test("AC-03.05: unarchive button triggers mutation with pending state and prevents double click", async () => {
    let unarchiveCalls = 0;
    const unarchiveDeferred = createDeferred<Response>();

    globalThis.fetch = mockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (
        init?.method === "POST" &&
        url.includes("/admin/documents/cccccccc-3333-4333-8333-333333333333/unarchive")
      ) {
        unarchiveCalls++;
        return unarchiveDeferred.promise;
      }
      if (url.includes("/admin/documents")) {
        return jsonResponse({
          success: true,
          data: sampleDocs,
          meta: { page: 1, limit: 20, total: 3 },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

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
    const cancelBtn = screen.getByRole("button", { name: "Batal" });

    // Klik pertama memicu mutasi
    act(() => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(unarchiveCalls).toBe(1);
      expect(confirmBtn.textContent).toBe("Memproses...");
      expect(confirmBtn.hasAttribute("disabled")).toBe(true);
      expect(cancelBtn.hasAttribute("disabled")).toBe(true);
    });

    // Klik kedua dicegah saat pending
    act(() => {
      fireEvent.click(confirmBtn);
    });
    expect(unarchiveCalls).toBe(1);

    // Selesaikan mutasi
    await act(async () => {
      unarchiveDeferred.resolve(
        jsonResponse({
          success: true,
          data: { id: "cccccccc-3333-4333-8333-333333333333", archivedAt: null },
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: /Batalkan arsip “Arsip-Lama\.pdf”\?/ }),
      ).toBeNull();
    });
  });

  test("AC-03.05: unarchive 403 error displays permission alert in dialog", async () => {
    globalThis.fetch = mockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (
        init?.method === "POST" &&
        url.includes("/admin/documents/cccccccc-3333-4333-8333-333333333333/unarchive")
      ) {
        return jsonResponse({ success: false, message: "Forbidden" }, 403);
      }
      if (url.includes("/admin/documents")) {
        return jsonResponse({
          success: true,
          data: sampleDocs,
          meta: { page: 1, limit: 20, total: 3 },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

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

    expect(
      await screen.findByText("Anda tidak memiliki izin untuk membatalkan arsip dokumen."),
    ).toBeTruthy();
  });

  test("AC-03.04: soft delete pending state, double click prevention, and row disappearance on success", async () => {
    let deleteCalls = 0;
    const deleteDeferred = createDeferred<Response>();
    let isDeleted = false;

    globalThis.fetch = mockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (
        init?.method === "DELETE" &&
        url.includes("/admin/documents/aaaaaaaa-1111-4111-8111-111111111111")
      ) {
        deleteCalls++;
        return deleteDeferred.promise;
      }
      if (url.includes("/admin/documents")) {
        const currentData = isDeleted
          ? sampleDocs.filter((d) => d.id !== "aaaaaaaa-1111-4111-8111-111111111111")
          : sampleDocs;
        return jsonResponse({
          success: true,
          data: currentData,
          meta: { page: 1, limit: 20, total: currentData.length },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

    renderAdminDocuments(adminSession);
    expect(await screen.findByRole("heading", { name: "Manajemen Dokumen" })).toBeTruthy();
    expect(screen.getByText("Laporan-Q1-2026.pdf")).toBeTruthy();

    const deleteBtn = screen.getByRole("button", { name: "Hapus dokumen Laporan-Q1-2026.pdf" });
    act(() => {
      fireEvent.click(deleteBtn);
    });

    expect(screen.getByRole("heading", { name: /Hapus “Laporan-Q1-2026\.pdf”\?/ })).toBeTruthy();
    expect(screen.getByText(/Data tetap tersimpan di server sebagai hapus lunak/)).toBeTruthy();

    const confirmBtn = screen.getByRole("button", { name: "Hapus Dokumen" });
    const cancelBtn = screen.getByRole("button", { name: "Batal" });

    // Klik pertama memicu mutasi
    act(() => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(deleteCalls).toBe(1);
      expect(confirmBtn.textContent).toBe("Menghapus...");
      expect(confirmBtn.hasAttribute("disabled")).toBe(true);
      expect(cancelBtn.hasAttribute("disabled")).toBe(true);
    });

    // Klik kedua dicegah saat pending
    act(() => {
      fireEvent.click(confirmBtn);
    });
    expect(deleteCalls).toBe(1);

    // Tandai terhapus di server dan selesaikan promise
    isDeleted = true;
    await act(async () => {
      deleteDeferred.resolve(
        jsonResponse({
          success: true,
          data: {
            id: "aaaaaaaa-1111-4111-8111-111111111111",
            deletedAt: "2026-11-04T00:00:00.000Z",
          },
        }),
      );
    });

    // Dialog tertutup dan baris dokumen hilang setelah invalidation refetch
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /Hapus “Laporan-Q1-2026\.pdf”\?/ })).toBeNull();
      expect(screen.queryByText("Laporan-Q1-2026.pdf")).toBeNull();
    });
  });

  test("AC-03.04: delete 403 error displays permission alert in dialog", async () => {
    globalThis.fetch = mockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (
        init?.method === "DELETE" &&
        url.includes("/admin/documents/aaaaaaaa-1111-4111-8111-111111111111")
      ) {
        return jsonResponse({ success: false, message: "Forbidden" }, 403);
      }
      if (url.includes("/admin/documents")) {
        return jsonResponse({
          success: true,
          data: sampleDocs,
          meta: { page: 1, limit: 20, total: 3 },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

    renderAdminDocuments(adminSession);
    expect(await screen.findByRole("heading", { name: "Manajemen Dokumen" })).toBeTruthy();

    const deleteBtn = screen.getByRole("button", { name: "Hapus dokumen Laporan-Q1-2026.pdf" });
    act(() => {
      fireEvent.click(deleteBtn);
    });

    const confirmBtn = screen.getByRole("button", { name: "Hapus Dokumen" });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(
      await screen.findByText("Anda tidak memiliki izin untuk menghapus dokumen."),
    ).toBeTruthy();
  });

  test("AC-03.02: document detail shows loading metadata then displays metadata without preview/download", async () => {
    const detailDeferred = createDeferred<Response>();

    globalThis.fetch = mockFetch(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/admin/documents/aaaaaaaa-1111-4111-8111-111111111111")) {
        return detailDeferred.promise;
      }
      if (url.includes("/admin/documents")) {
        return jsonResponse({
          success: true,
          data: sampleDocs,
          meta: { page: 1, limit: 20, total: 3 },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

    renderAdminDocuments(adminSession);
    expect(await screen.findByRole("heading", { name: "Manajemen Dokumen" })).toBeTruthy();

    const titleBtn = screen.getByRole("button", { name: "Laporan-Q1-2026.pdf" });
    act(() => {
      fireEvent.click(titleBtn);
    });

    // Dialog terbuka dan menampilkan status loading metadata
    expect(await screen.findByText("Detail Metadata Dokumen")).toBeTruthy();
    expect(screen.getByText("Memuat metadata...")).toBeTruthy();

    // Selesaikan pemuatan detail
    await act(async () => {
      detailDeferred.resolve(
        jsonResponse({
          success: true,
          data: {
            ...sampleDocs[0],
            categoryId: "33333333-3333-4333-8333-333333333333",
            categoryName: "Keuangan",
            metadata: { author: "Dr. Siti Rahma", extractedAt: "2026-04-17T08:05:00.000Z" },
          },
        }),
      );
    });

    expect(await screen.findByText("Keuangan")).toBeTruthy();
    expect(screen.getByText("Dr. Siti Rahma")).toBeTruthy();
    expect(screen.queryByText("Memuat metadata...")).toBeNull();
    expect(screen.queryByRole("link", { name: /unduh|download/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /unduh|download|pratinjau|preview/i })).toBeNull();
  });

  test("Search filter: filters documents on the active page by title", async () => {
    globalThis.fetch = mockFetch(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/admin/documents")) {
        return jsonResponse({
          success: true,
          data: sampleDocs,
          meta: { page: 1, limit: 20, total: 3 },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

    renderAdminDocuments(adminSession);
    expect(await screen.findByRole("heading", { name: "Manajemen Dokumen" })).toBeTruthy();

    const searchInput = screen.getByLabelText("Cari judul dokumen pada halaman ini");
    act(() => {
      fireEvent.change(searchInput, { target: { value: "Laporan" } });
    });

    expect(screen.getByText("Laporan-Q1-2026.pdf")).toBeTruthy();
    expect(screen.queryByText("Legacy-Document.docx")).toBeNull();

    act(() => {
      fireEvent.change(searchInput, { target: { value: "judul-tidak-ada" } });
    });
    expect(screen.getByText("Tidak ada judul yang cocok pada halaman ini.")).toBeTruthy();
  });

  test("Pagination: previous and next page buttons interact correctly", async () => {
    let requestedPage = 1;

    globalThis.fetch = mockFetch(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/admin/documents")) {
        const parsedUrl = new URL(url, "http://localhost");
        requestedPage = Number(parsedUrl.searchParams.get("page") ?? "1");
        return jsonResponse({
          success: true,
          data: sampleDocs,
          meta: { page: requestedPage, limit: 20, total: 21 },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

    renderAdminDocuments(adminSession);
    expect(await screen.findByRole("heading", { name: "Manajemen Dokumen" })).toBeTruthy();

    const prevBtn = screen.getByRole("button", { name: "Sebelumnya" });
    const nextBtn = screen.getByRole("button", { name: "Berikutnya" });

    expect(prevBtn.hasAttribute("disabled")).toBe(true);
    expect(nextBtn.hasAttribute("disabled")).toBe(false);

    await act(async () => {
      fireEvent.click(nextBtn);
    });

    expect(requestedPage).toBe(2);
    expect(await screen.findByText(/Halaman 2/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sebelumnya" }));
    });
    await waitFor(() => expect(requestedPage).toBe(1));
    expect(await screen.findByText(/Halaman 1/)).toBeTruthy();
  });

  test("Route gate: member_team is redirected and 0 documents requests are made", async () => {
    let adminDocsRequests = 0;
    globalThis.fetch = mockFetch(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/admin/documents")) {
        adminDocsRequests++;
      }
      return jsonResponse({ success: true, data: [] });
    });

    renderAdminDocuments(memberSession);

    expect(screen.queryByRole("heading", { name: "Manajemen Dokumen" })).toBeNull();
    expect(screen.getByText("Akses Dibatasi")).toBeTruthy();
    expect(adminDocsRequests).toBe(0);
  });

  test("Route gate: head_of_team is redirected and 0 documents requests are made", async () => {
    let adminDocsRequests = 0;
    globalThis.fetch = mockFetch(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/admin/documents")) {
        adminDocsRequests++;
      }
      return jsonResponse({ success: true, data: [] });
    });

    renderAdminDocuments(headOfTeamSession);

    expect(screen.queryByRole("heading", { name: "Manajemen Dokumen" })).toBeNull();
    expect(screen.getByText("Akses Dibatasi")).toBeTruthy();
    expect(adminDocsRequests).toBe(0);
  });

  test("Role menu: admin role resolves correctly and provides Manajemen Dokumen navigation", () => {
    expect(resolveShellRole("admin")).toBe("admin");
    const adminMenu = ROLE_MENU.admin;
    expect(adminMenu.length).toBeGreaterThan(0);
    expect(
      adminMenu.some(
        (entry) => entry.label === "Manajemen Dokumen" && entry.to === "/admin/documents",
      ),
    ).toBe(true);
  });

  test("Error handling: 500 error shows retry button and clicking it retries", async () => {
    let callCount = 0;
    globalThis.fetch = mockFetch(async () => {
      callCount++;
      if (callCount <= 2) {
        return jsonResponse({ success: false }, 500);
      }
      return jsonResponse({
        success: true,
        data: sampleDocs,
        meta: { page: 1, limit: 20, total: 3 },
      });
    });

    renderAdminDocuments(adminSession);

    expect(await screen.findByText("Daftar dokumen gagal dimuat.")).toBeTruthy();
    const retryBtn = screen.getByRole("button", { name: "Coba lagi" });
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    expect(await screen.findByText("Laporan-Q1-2026.pdf")).toBeTruthy();
  });
});
