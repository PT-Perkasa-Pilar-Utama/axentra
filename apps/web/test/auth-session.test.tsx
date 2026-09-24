import { describe, expect, beforeEach, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import type { AuthUser } from "@axentra/shared";
import { z } from "zod";
import { apiRequest, setAuthTokenGetter, setUnauthorizedHandler } from "../src/lib/api-client";
import {
  AUTH_SESSION_STORAGE_KEY,
  clearSession,
  getAuthToken,
  loadSession,
  saveSession,
  type AuthSession,
} from "../src/features/auth/session.storage";
import { AuthSessionProvider } from "../src/features/auth/auth-session.context";
import { ProtectedRoute } from "../src/features/auth/protected-route.view";
import { UserSessionBadge } from "../src/features/auth/user-session-badge.view";

function createMockStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: createMockStorage(),
    writable: true,
  });
}

if (typeof globalThis.sessionStorage === "undefined") {
  Object.defineProperty(globalThis, "sessionStorage", {
    value: createMockStorage(),
    writable: true,
  });
}

function createMockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit | undefined) => Promise<Response>,
) {
  return Object.assign(handler, {
    preconnect: (
      _url: string | URL,
      _options?: { dns?: boolean; tcp?: boolean; http?: boolean; https?: boolean } | undefined,
    ): void => {},
  });
}

const mockMemberUser: AuthUser = {
  id: "usr-001",
  email: "member@axentra.local",
  role: "member_team",
  name: "Budi Santoso",
};

const mockHeadUser: AuthUser = {
  id: "usr-002",
  email: "head@axentra.local",
  role: "head_of_team",
  name: "Siti Rahma",
};

describe("FE-S1-06: Session Storage Manager", () => {
  beforeEach(() => {
    clearSession();
    localStorage.clear();
    sessionStorage.clear();
  });

  test("persists session in localStorage when rememberMe is true", () => {
    const session: AuthSession = {
      user: mockMemberUser,
      token: "ax_token_remember_true",
      refreshToken: "ax_rt_remember_true",
      rememberMe: true,
    };

    saveSession(session);

    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).not.toBeNull();
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    expect(getAuthToken()).toBe("ax_token_remember_true");

    const loaded = loadSession();
    expect(loaded?.user.email).toBe("member@axentra.local");
    expect(loaded?.rememberMe).toBe(true);
  });

  test("persists session in sessionStorage when rememberMe is false", () => {
    const session: AuthSession = {
      user: mockMemberUser,
      token: "ax_token_remember_false",
      refreshToken: "ax_rt_remember_false",
      rememberMe: false,
    };

    saveSession(session);

    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    expect(getAuthToken()).toBe("ax_token_remember_false");

    const loaded = loadSession();
    expect(loaded?.user.email).toBe("member@axentra.local");
    expect(loaded?.rememberMe).toBe(false);
  });

  test("clearSession removes data from both storage mechanisms", () => {
    const session: AuthSession = {
      user: mockMemberUser,
      token: "ax_token_to_clear",
      rememberMe: true,
    };

    saveSession(session);
    expect(getAuthToken()).toBe("ax_token_to_clear");

    clearSession();
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    expect(getAuthToken()).toBeNull();
  });
});

describe("FE-S1-06: Automatic Bearer Token Client Injection", () => {
  beforeEach(() => {
    setAuthTokenGetter(null);
    setUnauthorizedHandler(null);
  });

  test("automatically injects Authorization: Bearer <token> on API requests", async () => {
    setAuthTokenGetter(() => "ax_mock_bearer_token");

    let capturedHeaders: Headers | undefined;

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ success: true, data: { status: "ok" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    try {
      const result = await apiRequest("/test-endpoint", z.object({ status: z.string() }));
      expect(result.status).toBe("ok");
      expect(capturedHeaders?.get("authorization")).toBe("Bearer ax_mock_bearer_token");
      expect(capturedHeaders?.get("accept")).toBe("application/json");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("triggers unauthorizedHandler when 401 status or error envelope is received", async () => {
    let unauthorizedTriggered = false;
    setUnauthorizedHandler(() => {
      unauthorizedTriggered = true;
    });

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () => {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "UNAUTHORIZED", message: "Token kadaluarsa" },
          }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    try {
      await expect(
        apiRequest("/protected-endpoint", z.object({ status: z.string() })),
      ).rejects.toThrow();
      expect(unauthorizedTriggered).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("FE-S1-06: ProtectedRoute and RBAC", () => {
  test("prevents unauthenticated user from accessing protected route", () => {
    const unauthenticatedSession: AuthSession | null = null;

    const html = renderToString(
      createElement(
        MemoryRouter,
        { initialEntries: ["/upload"] },
        createElement(
          AuthSessionProvider,
          { initialSession: unauthenticatedSession },
          createElement(
            Routes,
            null,
            createElement(
              Route,
              { element: createElement(ProtectedRoute) },
              createElement(Route, {
                path: "/upload",
                element: createElement("div", null, "Protected Content"),
              }),
            ),
          ),
        ),
      ),
    );

    expect(html).not.toContain("Protected Content");
  });

  test("renders protected content when user is authenticated", () => {
    const authenticatedSession: AuthSession = {
      user: mockMemberUser,
      token: "ax_valid_token",
      rememberMe: true,
    };

    const html = renderToString(
      createElement(
        MemoryRouter,
        { initialEntries: ["/upload"] },
        createElement(
          AuthSessionProvider,
          { initialSession: authenticatedSession },
          createElement(
            Routes,
            null,
            createElement(
              Route,
              { element: createElement(ProtectedRoute) },
              createElement(Route, {
                path: "/upload",
                element: createElement("div", null, "Protected Content"),
              }),
            ),
          ),
        ),
      ),
    );

    expect(html).toContain("Protected Content");
  });

  test("shows 403 Akses Dibatasi when user role is not allowed", () => {
    const memberSession: AuthSession = {
      user: mockMemberUser,
      token: "ax_member_token",
      rememberMe: true,
    };

    const html = renderToString(
      createElement(
        MemoryRouter,
        { initialEntries: ["/head-only"] },
        createElement(
          AuthSessionProvider,
          { initialSession: memberSession },
          createElement(
            Routes,
            null,
            createElement(
              Route,
              {
                element: createElement(ProtectedRoute, {
                  allowedRoles: ["head_of_team"],
                }),
              },
              createElement(Route, {
                path: "/head-only",
                element: createElement("div", null, "Head of Team Only"),
              }),
            ),
          ),
        ),
      ),
    );

    expect(html).toContain("Akses Dibatasi");
    expect(html).not.toContain("Head of Team Only");
  });
});

describe("FE-S1-06: UserSessionBadge View", () => {
  test("renders user initials, name, and role label", () => {
    const session: AuthSession = {
      user: mockHeadUser,
      token: "ax_head_token",
      rememberMe: true,
    };

    const html = renderToString(
      createElement(
        MemoryRouter,
        null,
        createElement(
          AuthSessionProvider,
          { initialSession: session },
          createElement(UserSessionBadge),
        ),
      ),
    );

    expect(html).toContain("Siti Rahma");
    expect(html).toContain("Head of Team");
    expect(html).toContain("Keluar");
  });

  test("renders nothing when user is not logged in", () => {
    const html = renderToString(
      createElement(
        MemoryRouter,
        null,
        createElement(
          AuthSessionProvider,
          { initialSession: null },
          createElement(UserSessionBadge),
        ),
      ),
    );

    expect(html).toBe("");
  });
});
