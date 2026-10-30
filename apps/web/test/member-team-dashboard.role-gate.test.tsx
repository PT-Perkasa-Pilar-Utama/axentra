import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AuthSessionProvider } from "../src/features/auth/auth-session.context";
import { clearSession, type AuthSession } from "../src/features/auth/session.storage";
import { router as productionRouter } from "../src/app/router";

const originalFetch = globalThis.fetch;

function sessionFor(role: "member_team" | "head_of_team"): AuthSession {
  return {
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: `${role}@axentra.test`,
      name: role,
      role,
    },
    token: `ax_${role}_token`,
    rememberMe: false,
  };
}

// Dasbor memuat daftar kosong; tes ini hanya memeriksa siapa yang melihat panel unggah.
function emptyDashboardFetch(): typeof fetch {
  const handler = async (): Promise<Response> =>
    Response.json({ success: true, data: [] }, { status: 200 });
  return Object.assign(handler, { preconnect: (): void => {} });
}

function renderDashboard(session: AuthSession): ReturnType<typeof render> {
  const protectedRoute = productionRouter.routes.find((route) => route.path === undefined);
  const dashboardChild = protectedRoute?.children?.find((route) => route.path === "/dashboard");
  if (!protectedRoute?.element || !dashboardChild?.element) {
    throw new Error("Production dashboard route is unavailable");
  }

  const memoryRouter = createMemoryRouter(
    [
      {
        element: protectedRoute.element,
        children: [{ path: "/dashboard", element: dashboardChild.element }],
      },
    ],
    { initialEntries: ["/dashboard"] },
  );

  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthSessionProvider initialSession={session}>
        <RouterProvider router={memoryRouter} />
      </AuthSessionProvider>
    </QueryClientProvider>,
  );
}

describe("Member team dashboard upload gate (AC-01.01, role gate)", () => {
  afterEach(() => {
    cleanup();
    clearSession();
    globalThis.fetch = originalFetch;
  });

  test("AC-01.01: member_team sees the upload area on the dashboard", async () => {
    globalThis.fetch = emptyDashboardFetch();

    await act(async () => {
      renderDashboard(sessionFor("member_team"));
    });

    expect(await screen.findByRole("region", { name: "Area Unggah Dokumen" })).toBeTruthy();
  });

  test("head_of_team does not see the upload area, while the rest of the dashboard still renders", async () => {
    globalThis.fetch = emptyDashboardFetch();

    await act(async () => {
      renderDashboard(sessionFor("head_of_team"));
    });

    expect(await screen.findByText("Semua Dokumen")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Area Unggah Dokumen" })).toBeNull();
  });
});
