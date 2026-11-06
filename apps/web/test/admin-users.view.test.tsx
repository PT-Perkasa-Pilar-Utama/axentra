import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AuthSessionProvider } from "../src/features/auth/auth-session.context";
import { clearSession, type AuthSession } from "../src/features/auth/session.storage";
import { router as productionRouter } from "../src/app/router";
import { updateAdminUserStatusPayloadSchema } from "../src/features/admin-users/admin-users.api";

const originalFetch = globalThis.fetch;

const sampleMember = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Budi Santoso",
  email: "budi@perkasa.example",
  role: "member_team" as const,
  status: "active" as const,
};

const sampleHead = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Siti Rahmawati",
  email: "siti@perkasa.example",
  role: "head_of_team" as const,
  status: "inactive" as const,
};

const adminSession: AuthSession = {
  user: {
    id: "99999999-9999-4999-8999-999999999999",
    email: "arya.admin@perkasa.example",
    name: "Arya Isnaidi",
    role: "admin",
  },
  token: "ax_admin_token",
  rememberMe: false,
};

const memberSession: AuthSession = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "member@perkasa.example",
    name: "Member Team",
    role: "member_team",
  },
  token: "ax_member_token",
  rememberMe: false,
};

const headOfTeamSession: AuthSession = {
  user: {
    id: "88888888-8888-4888-8888-888888888888",
    email: "head@perkasa.example",
    name: "Head of Team",
    role: "head_of_team",
  },
  token: "ax_head_token",
  rememberMe: false,
};

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
      mutations: { retry: false },
    },
  });
}

function renderAdminUsersPage(
  session: AuthSession | null,
  initialPath = "/admin/users",
): ReturnType<typeof render> {
  const memoryRouter = createMemoryRouter(productionRouter.routes, {
    initialEntries: [initialPath],
  });

  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <AuthSessionProvider initialSession={session}>
        <RouterProvider router={memoryRouter} />
      </AuthSessionProvider>
    </QueryClientProvider>,
  );
}

describe("Admin Users Feature (FE-S4-05 / PROP-ADM-AC-02)", () => {
  afterEach(() => {
    cleanup();
    clearSession();
    globalThis.fetch = originalFetch;
  });

  test("AC-02.01 & AC-02.02: renders user list, opens confirmation, and updates status to inactive", async () => {
    let currentStatus: "active" | "inactive" = "active";
    let patchCount = 0;
    let releasePatch: (() => void) | undefined;
    const patchDelay = new Promise<void>((resolve) => {
      releasePatch = resolve;
    });

    globalThis.fetch = Object.assign(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (init?.method === "PATCH") {
          patchCount += 1;
          const payload = updateAdminUserStatusPayloadSchema.parse(JSON.parse(String(init.body)));
          await patchDelay;
          currentStatus = payload.status;
          return Response.json({
            success: true,
            data: { id: sampleMember.id, role: sampleMember.role, status: currentStatus },
          });
        }
        return Response.json({
          success: true,
          data: [{ ...sampleMember, status: currentStatus }],
          meta: { page: 1, limit: 20, total: 1 },
        });
      },
      { preconnect: (): void => {} },
    );

    renderAdminUsersPage(adminSession);

    // Sidebar contains single admin menu entry: Manajemen Akun
    const sidebarLink = await screen.findByRole("link", { name: "Manajemen Akun" });
    expect(sidebarLink).toBeTruthy();
    expect(sidebarLink.getAttribute("href")).toBe("/admin/users");

    // Page heading and description
    expect(await screen.findByRole("heading", { name: "Manajemen Akun" })).toBeTruthy();
    expect(screen.getByText("Budi Santoso")).toBeTruthy();
    expect(screen.getByText("Member Team")).toBeTruthy();
    expect(screen.getByText("Aktif")).toBeTruthy();

    // Trigger deactivation modal
    const deactivateBtn = screen.getByRole("button", { name: "Nonaktifkan akun Budi Santoso" });
    fireEvent.click(deactivateBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(
      within(dialog).getByRole("heading", { name: "Nonaktifkan akun Budi Santoso?" }),
    ).toBeTruthy();

    // Cancel deactivation
    fireEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
    expect(patchCount).toBe(0);

    // Reopen and confirm
    fireEvent.click(deactivateBtn);
    const confirmBtn = within(screen.getByRole("dialog")).getByRole("button", {
      name: "Nonaktifkan",
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(confirmBtn.textContent).toBe("Menyimpan...");
      expect(confirmBtn.hasAttribute("disabled")).toBe(true);
      expect(
        within(screen.getByRole("dialog"))
          .getByRole("button", { name: "Batal" })
          .hasAttribute("disabled"),
      ).toBe(true);
    });

    releasePatch?.();

    await waitFor(() => expect(screen.getByText("Nonaktif")).toBeTruthy());
    expect(patchCount).toBe(1);
  });

  test("AC-02.03: activates inactive account via confirmation dialog", async () => {
    let currentStatus: "active" | "inactive" = "inactive";
    let patchCount = 0;

    globalThis.fetch = Object.assign(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (init?.method === "PATCH") {
          patchCount += 1;
          const payload = updateAdminUserStatusPayloadSchema.parse(JSON.parse(String(init.body)));
          currentStatus = payload.status;
          return Response.json({
            success: true,
            data: { id: sampleHead.id, role: sampleHead.role, status: currentStatus },
          });
        }
        return Response.json({
          success: true,
          data: [{ ...sampleHead, status: currentStatus }],
          meta: { page: 1, limit: 20, total: 1 },
        });
      },
      { preconnect: (): void => {} },
    );

    renderAdminUsersPage(adminSession);

    expect(await screen.findByRole("heading", { name: "Manajemen Akun" })).toBeTruthy();
    expect(screen.getByText("Siti Rahmawati")).toBeTruthy();
    expect(screen.getByText("Head of Team")).toBeTruthy();
    expect(screen.getByText("Nonaktif")).toBeTruthy();

    const activateBtn = screen.getByRole("button", { name: "Aktifkan akun Siti Rahmawati" });
    fireEvent.click(activateBtn);

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Aktifkan akun Siti Rahmawati?" }),
    ).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Aktifkan" }));

    await waitFor(() => expect(screen.getByText("Aktif")).toBeTruthy());
    expect(patchCount).toBe(1);
  });

  test("handles LAST_HEAD_OF_TEAM error gracefully in dialog", async () => {
    const activeHead = { ...sampleHead, status: "active" as const };

    globalThis.fetch = Object.assign(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (init?.method === "PATCH") {
          return Response.json(
            {
              success: false,
              error: {
                code: "LAST_HEAD_OF_TEAM",
                message: "Head of Team aktif terakhir tidak dapat dinonaktifkan.",
              },
            },
            { status: 422 },
          );
        }
        return Response.json({
          success: true,
          data: [activeHead],
          meta: { page: 1, limit: 20, total: 1 },
        });
      },
      { preconnect: (): void => {} },
    );

    renderAdminUsersPage(adminSession);

    const deactivateBtn = await screen.findByRole("button", {
      name: "Nonaktifkan akun Siti Rahmawati",
    });
    fireEvent.click(deactivateBtn);

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Nonaktifkan" }));

    expect(
      await within(dialog).findByText("Head of Team aktif terakhir tidak dapat dinonaktifkan."),
    ).toBeTruthy();
  });

  test("shows an error when a status update fails", async () => {
    globalThis.fetch = Object.assign(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (init?.method === "PATCH") {
          return Response.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "server failure" } },
            { status: 500 },
          );
        }
        return Response.json({
          success: true,
          data: [sampleMember],
          meta: { page: 1, limit: 20, total: 1 },
        });
      },
      { preconnect: (): void => {} },
    );

    renderAdminUsersPage(adminSession);
    fireEvent.click(await screen.findByRole("button", { name: "Nonaktifkan akun Budi Santoso" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Nonaktifkan" }));

    expect(await within(dialog).findByRole("alert")).toBeTruthy();
    expect(within(dialog).getByText("Status akun gagal diubah. Silakan coba lagi.")).toBeTruthy();
    expect(screen.getByText("Aktif")).toBeTruthy();
  });

  test("allows retry after a transient list error", async () => {
    let requests = 0;
    globalThis.fetch = Object.assign(
      async (): Promise<Response> => {
        requests += 1;
        if (requests <= 2) {
          return Response.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "server failure" } },
            { status: 500 },
          );
        }
        return Response.json({
          success: true,
          data: [sampleMember],
          meta: { page: 1, limit: 20, total: 1 },
        });
      },
      { preconnect: (): void => {} },
    );

    renderAdminUsersPage(adminSession);
    expect(await screen.findByText("Daftar akun gagal dimuat.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(await screen.findByText("Budi Santoso")).toBeTruthy();
    expect(requests).toBe(3);
  });

  test("shows the loading state while the account list request is pending", async () => {
    let resolveList: ((response: Response) => void) | undefined;
    const pendingList = new Promise<Response>((resolve) => {
      resolveList = resolve;
    });
    globalThis.fetch = Object.assign(async (): Promise<Response> => pendingList, {
      preconnect: (): void => {},
    });

    renderAdminUsersPage(adminSession);
    expect(screen.getByText("Memuat daftar akun...")).toBeTruthy();
    expect(screen.queryByText("Belum ada akun.")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();

    resolveList?.(
      Response.json({
        success: true,
        data: [sampleMember],
        meta: { page: 1, limit: 20, total: 1 },
      }),
    );
    expect(await screen.findByText("Budi Santoso")).toBeTruthy();
  });

  test("shows the forbidden message when the account list is denied", async () => {
    globalThis.fetch = Object.assign(
      async (): Promise<Response> =>
        Response.json(
          { success: false, error: { code: "FORBIDDEN", message: "Access denied" } },
          { status: 403 },
        ),
      { preconnect: (): void => {} },
    );

    renderAdminUsersPage(adminSession);
    expect(await screen.findByText("Anda tidak memiliki izin untuk melihat akun.")).toBeTruthy();
    expect(screen.queryByText("Belum ada akun.")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Coba lagi" })).toBeNull();
  });

  test("blocks member_team from accessing /admin/users", async () => {
    let requests = 0;
    globalThis.fetch = Object.assign(
      async (): Promise<Response> => {
        requests += 1;
        return Response.json({});
      },
      { preconnect: (): void => {} },
    );
    renderAdminUsersPage(memberSession);

    expect(await screen.findByRole("heading", { name: "Akses Dibatasi" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Manajemen Akun" })).toBeNull();
    expect(requests).toBe(0);
  });

  test("blocks head_of_team from accessing /admin/users", async () => {
    let requests = 0;
    globalThis.fetch = Object.assign(
      async (): Promise<Response> => {
        requests += 1;
        return Response.json({});
      },
      { preconnect: (): void => {} },
    );
    renderAdminUsersPage(headOfTeamSession);

    expect(await screen.findByRole("heading", { name: "Akses Dibatasi" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Manajemen Akun" })).toBeNull();
    expect(requests).toBe(0);
  });

  test("redirects unauthenticated visitor to /login", async () => {
    renderAdminUsersPage(null);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Masuk/ })).toBeTruthy();
      expect(screen.getByLabelText("Alamat email")).toBeTruthy();
    });
  });
});
