import { afterEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminUsersView } from "../src/features/admin-users/admin-users.view";

const originalFetch = globalThis.fetch;
const account = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Budi",
  email: "budi@example.test",
  role: "member_team",
  status: "active",
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function showPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AdminUsersView />
    </QueryClientProvider>,
  );
}

test("shows real response and confirms status change", async () => {
  let status = "active";
  let patches = 0;
  globalThis.fetch = Object.assign(
    async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (init?.method === "PATCH") {
        patches++;
        status = JSON.parse(String(init.body)).status;
        return Response.json({
          success: true,
          data: { id: account.id, role: account.role, status },
        });
      }
      return Response.json({
        success: true,
        data: [{ ...account, status }],
        meta: { page: 1, limit: 20, total: 1 },
      });
    },
    { preconnect: (): void => {} },
  );
  showPage();
  fireEvent.click(await screen.findByRole("button", { name: "Nonaktifkan akun Budi" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Batal" }));
  expect(patches).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "Nonaktifkan akun Budi" }));
  fireEvent.click(screen.getByRole("button", { name: "Nonaktifkan" }));
  await waitFor(() => expect(screen.getByText("Nonaktif")).toBeTruthy());
  expect(patches).toBe(1);
});

test("shows denied response without an empty state", async () => {
  globalThis.fetch = Object.assign(
    async (): Promise<Response> =>
      Response.json(
        { success: false, error: { code: "FORBIDDEN", message: "denied" } },
        { status: 403 },
      ),
    { preconnect: (): void => {} },
  );
  showPage();
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Anda tidak memiliki izin");
  expect(screen.queryByText("Belum ada akun.")).toBeNull();
});
