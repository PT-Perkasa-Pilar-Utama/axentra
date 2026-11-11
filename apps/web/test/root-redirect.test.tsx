import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { AuthSessionProvider } from "../src/features/auth/auth-session.context";
import { clearSession, type AuthSession } from "../src/features/auth/session.storage";
import { router as productionRouter } from "../src/app/router";
import { ADMIN_DASHBOARD_PATH, DASHBOARD_PATH } from "../src/app/app-shell.menu";

function sessionFor(role: "member_team" | "admin"): AuthSession {
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

// Route produksi untuk "/" dan "/login", dengan halaman tujuan diganti penanda sederhana.
function routesUnderTest(): RouteObject[] {
  const protectedRoute = productionRouter.routes.find((route) =>
    route.children?.some((child) => child.path === "/"),
  );
  const rootChild = protectedRoute?.children?.find((child) => child.path === "/");
  if (!protectedRoute?.element || !rootChild?.element) {
    throw new Error("Production root route is unavailable");
  }

  return [
    {
      element: protectedRoute.element,
      children: [{ path: "/", element: rootChild.element }],
    },
    { path: "/login", element: <p>login-page</p> },
    { path: DASHBOARD_PATH, element: <p>dashboard-page</p> },
    { path: ADMIN_DASHBOARD_PATH, element: <p>admin-dashboard-page</p> },
  ];
}

async function landingPathFor(session: AuthSession | null): Promise<string> {
  const memoryRouter = createMemoryRouter(routesUnderTest(), { initialEntries: ["/"] });
  await act(async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AuthSessionProvider initialSession={session}>
          <RouterProvider router={memoryRouter} />
        </AuthSessionProvider>
      </QueryClientProvider>,
    );
  });
  return memoryRouter.state.location.pathname;
}

describe("Root path redirect", () => {
  afterEach(() => {
    cleanup();
    clearSession();
  });

  test("a visitor without a session is sent to /login", async () => {
    expect(await landingPathFor(null)).toBe("/login");
  });

  test("a member_team session is sent to the member dashboard", async () => {
    expect(await landingPathFor(sessionFor("member_team"))).toBe(DASHBOARD_PATH);
  });

  test("an admin session is sent to the admin dashboard", async () => {
    expect(await landingPathFor(sessionFor("admin"))).toBe(ADMIN_DASHBOARD_PATH);
  });

  test("the platform status page moves to /status", () => {
    expect(productionRouter.routes.some((route) => route.path === "/status")).toBe(true);
  });
});
