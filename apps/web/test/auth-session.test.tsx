import { describe, expect, beforeEach, spyOn, test } from "bun:test";
import { createMemoryRouter, MemoryRouter, Route, Routes, RouterProvider } from "react-router";
import type { AuthUser, LoginRequest, LoginResponse } from "@axentra/shared";
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
import { AuthSessionProvider, useAuthSession } from "../src/features/auth/auth-session.context";
import { ProtectedRoute } from "../src/features/auth/protected-route.view";
import { UserSessionBadge, USER_ROLE_LABELS } from "../src/features/auth/user-session-badge.view";
import { LoginPage } from "../src/features/auth/login.view";
import type { LoginPresenter } from "../src/features/auth/login.presenter";
import { renderToString } from "react-dom/server";

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

function TestConsumer(props: { onRender: (ctx: ReturnType<typeof useAuthSession>) => void }) {
  const context = useAuthSession();
  props.onRender(context);
  return <div>{context.isAuthenticated ? "Logged In" : "Logged Out"}</div>;
}

describe("FE-S1-06: In-Memory Token Storage (F1)", () => {
  beforeEach(() => {
    clearSession();
    localStorage.clear();
    sessionStorage.clear();
  });

  test("keeps bearer and refresh tokens in memory only and NEVER writes them to Web Storage", () => {
    const session: AuthSession = {
      user: mockMemberUser,
      token: "ax_token_secret_123",
      refreshToken: "ax_rt_secret_456",
      rememberMe: true,
    };

    saveSession(session);

    // In-memory getter returns token
    expect(getAuthToken()).toBe("ax_token_secret_123");
    expect(loadSession()?.token).toBe("ax_token_secret_123");

    // Web Storage (localStorage & sessionStorage) MUST NOT contain tokens
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  test("purges any legacy storage keys and clears in-memory token on clearSession", () => {
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, "legacy_stale_data");
    sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, "legacy_stale_data");

    const session: AuthSession = {
      user: mockMemberUser,
      token: "ax_token_temp",
      rememberMe: false,
    };

    saveSession(session);
    expect(getAuthToken()).toBe("ax_token_temp");
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();

    clearSession();
    expect(getAuthToken()).toBeNull();
    expect(loadSession()).toBeNull();
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

describe("FE-S1-06: 401 Redirect and Session Cleared (F2, F3)", () => {
  beforeEach(() => {
    clearSession();
    setAuthTokenGetter(null);
    setUnauthorizedHandler(null);
  });

  test("mounts provider and router, receives 401 from API, clears session, and observes redirect to /login with preserved location (F3)", async () => {
    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          pathname: "/protected-dashboard",
          search: "",
        },
      },
      writable: true,
      configurable: true,
    });

    const initialSession: AuthSession = {
      user: mockMemberUser,
      token: "ax_expiring_token",
      rememberMe: false,
    };

    const router = createMemoryRouter(
      [
        {
          path: "/protected-dashboard",
          element: <div>Protected Dashboard View</div>,
        },
        {
          path: "/login",
          element: <div>Halaman Login Perkasa</div>,
        },
      ],
      {
        initialEntries: ["/protected-dashboard"],
      },
    );

    const initialHtml = renderToString(
      <AuthSessionProvider
        initialSession={initialSession}
        onUnauthorized={(currentPath) => {
          void router.navigate("/login", {
            state: { from: { pathname: currentPath || "/" } },
            replace: true,
          });
        }}
      >
        <RouterProvider router={router} />
      </AuthSessionProvider>,
    );

    expect(initialHtml).toContain("Protected Dashboard View");
    expect(getAuthToken()).toBe("ax_expiring_token");
    expect(router.state.location.pathname).toBe("/protected-dashboard");

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () => {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "UNAUTHORIZED", message: "Sesi telah berakhir" },
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
        apiRequest("/api/v1/documents", z.object({ success: z.boolean() })),
      ).rejects.toThrow();

      // Proves token cleared from in-memory session
      expect(getAuthToken()).toBeNull();
      // Proves router location updated to /login using production redirect path
      expect(router.state.location.pathname).toBe("/login");
      // Proves preserved location state contains attempted path
      expect(router.state.location.state).toEqual({
        from: { pathname: "/protected-dashboard" },
      });

      // Proves rendered HTML becomes the login route
      const after401Html = renderToString(
        <AuthSessionProvider>
          <RouterProvider router={router} />
        </AuthSessionProvider>,
      );
      expect(after401Html).toContain("Halaman Login Perkasa");
      expect(after401Html).not.toContain("Protected Dashboard View");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("FE-S1-06: Login Success Behavior and Routing (F3)", () => {
  beforeEach(() => {
    clearSession();
  });

  test("submits login with credentials and observes navigation to saved destination (F3)", async () => {
    let capturedPresenter: LoginPresenter | undefined;

    const mockLoginResponse: LoginResponse = {
      user: mockMemberUser,
      token: "ax_new_session_token",
      refreshToken: "ax_new_rt",
    };

    const mockLoginFn = async (_payload: LoginRequest): Promise<LoginResponse> => {
      return mockLoginResponse;
    };

    const router = createMemoryRouter(
      [
        {
          path: "/login",
          element: (
            <LoginPage
              initialEmail="user@perkasa.co.id"
              loginFn={mockLoginFn}
              navigate={(to, opts) => {
                void router.navigate(to, opts);
              }}
              onPresenterReady={(presenter) => {
                capturedPresenter = presenter;
              }}
            />
          ),
        },
        {
          path: "/custom-destination",
          element: <div>Halaman Custom Destination Berhasil</div>,
        },
      ],
      {
        initialEntries: [
          { pathname: "/login", state: { from: { pathname: "/custom-destination" } } },
        ],
      },
    );

    const initialHtml = renderToString(
      <AuthSessionProvider initialSession={null}>
        <RouterProvider router={router} />
      </AuthSessionProvider>,
    );

    expect(initialHtml).toContain("PERKASA");
    expect(initialHtml).toContain("Masuk");
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.state).toEqual({
      from: { pathname: "/custom-destination" },
    });
    expect(capturedPresenter).toBeDefined();
    if (!capturedPresenter) {
      throw new Error("Presenter failed to initialize");
    }

    // Submit form with valid credentials
    const submitSuccess = await capturedPresenter.submitValues({
      email: "user@perkasa.co.id",
      password: "ValidPassword123",
      rememberMe: true,
    });

    expect(submitSuccess).toBe(true);
    expect(getAuthToken()).toBe("ax_new_session_token");
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();

    // Proves router navigated to the saved destination from state.from
    expect(router.state.location.pathname).toBe("/custom-destination");

    // Proves rendered HTML becomes the custom destination view
    const destinationHtml = renderToString(
      <AuthSessionProvider>
        <RouterProvider router={router} />
      </AuthSessionProvider>,
    );
    expect(destinationHtml).toContain("Halaman Custom Destination Berhasil");
    expect(destinationHtml).not.toContain("Masuk");
  });

  test("redirects to dashboard when login succeeds without a saved destination", async () => {
    let capturedPresenter: LoginPresenter | undefined;

    const mockLoginResponse: LoginResponse = {
      user: mockMemberUser,
      token: "ax_dashboard_token",
      refreshToken: "ax_dashboard_rt",
    };

    const mockLoginFn = async (_payload: LoginRequest): Promise<LoginResponse> => {
      return mockLoginResponse;
    };

    const router = createMemoryRouter(
      [
        {
          path: "/login",
          element: (
            <LoginPage
              initialEmail="user@perkasa.co.id"
              loginFn={mockLoginFn}
              navigate={(to, opts) => {
                void router.navigate(to, opts);
              }}
              onPresenterReady={(presenter) => {
                capturedPresenter = presenter;
              }}
            />
          ),
        },
        {
          path: "/dashboard",
          element: <div>Halaman Dashboard Berhasil</div>,
        },
      ],
      {
        initialEntries: ["/login"],
      },
    );

    renderToString(
      <AuthSessionProvider initialSession={null}>
        <RouterProvider router={router} />
      </AuthSessionProvider>,
    );

    if (!capturedPresenter) {
      throw new Error("Presenter failed to initialize");
    }

    const submitSuccess = await capturedPresenter.submitValues({
      email: "user@perkasa.co.id",
      password: "ValidPassword123",
      rememberMe: false,
    });

    expect(submitSuccess).toBe(true);
    expect(getAuthToken()).toBe("ax_dashboard_token");
    expect(router.state.location.pathname).toBe("/dashboard");
  });

  test("loginSession stores session in memory and updates isAuthenticated", () => {
    let capturedContext: ReturnType<typeof useAuthSession> | undefined;

    const onRender = (ctx: ReturnType<typeof useAuthSession>) => {
      capturedContext = ctx;
    };

    const html = renderToString(
      <AuthSessionProvider initialSession={null}>
        <TestConsumer onRender={onRender} />
      </AuthSessionProvider>,
    );

    expect(html).toContain("Logged Out");
    expect(capturedContext?.isAuthenticated).toBe(false);

    const mockResponse: LoginResponse = {
      user: mockMemberUser,
      token: "ax_new_token",
      refreshToken: "ax_new_rt",
    };

    capturedContext?.loginSession(mockResponse, true);
    expect(getAuthToken()).toBe("ax_new_token");
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });
});

describe("FE-S1-06: ProtectedRoute and RBAC", () => {
  test("prevents unauthenticated user from accessing protected route", () => {
    const unauthenticatedSession: AuthSession | null = null;

    const html = renderToString(
      <MemoryRouter initialEntries={["/upload"]}>
        <AuthSessionProvider initialSession={unauthenticatedSession}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/upload" element={<div>Protected Content</div>} />
            </Route>
          </Routes>
        </AuthSessionProvider>
      </MemoryRouter>,
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
      <MemoryRouter initialEntries={["/upload"]}>
        <AuthSessionProvider initialSession={authenticatedSession}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/upload" element={<div>Protected Content</div>} />
            </Route>
          </Routes>
        </AuthSessionProvider>
      </MemoryRouter>,
    );

    expect(html).toContain("Protected Content");
  });

  test("protects the dashboard route from unauthenticated users", () => {
    const html = renderToString(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AuthSessionProvider initialSession={null}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<div>Dashboard Content</div>} />
            </Route>
          </Routes>
        </AuthSessionProvider>
      </MemoryRouter>,
    );

    expect(html).not.toContain("Dashboard Content");
  });

  test("shows 403 Akses Dibatasi when user role is not allowed", () => {
    const memberSession: AuthSession = {
      user: mockMemberUser,
      token: "ax_member_token",
      rememberMe: true,
    };

    const html = renderToString(
      <MemoryRouter initialEntries={["/head-only"]}>
        <AuthSessionProvider initialSession={memberSession}>
          <Routes>
            <Route element={<ProtectedRoute allowedRoles={["head_of_team"]} />}>
              <Route path="/head-only" element={<div>Head of Team Only</div>} />
            </Route>
          </Routes>
        </AuthSessionProvider>
      </MemoryRouter>,
    );

    expect(html).toContain("Akses Dibatasi");
    expect(html).not.toContain("Head of Team Only");
  });
});

describe("FE-S1-06: UserSessionBadge View with Bahasa Indonesia Role Labels (F5)", () => {
  test("renders user initials, name, and Bahasa Indonesia role label for head_of_team (Ketua Tim)", () => {
    const session: AuthSession = {
      user: mockHeadUser,
      token: "ax_head_token",
      rememberMe: true,
    };

    const html = renderToString(
      <MemoryRouter>
        <AuthSessionProvider initialSession={session}>
          <UserSessionBadge />
        </AuthSessionProvider>
      </MemoryRouter>,
    );

    expect(html).toContain("Siti Rahma");
    expect(html).toContain("Ketua Tim");
    expect(html).toContain("Keluar");
    expect(USER_ROLE_LABELS.head_of_team).toBe("Ketua Tim");
  });

  test("renders Bahasa Indonesia role label for member_team (Anggota Tim)", () => {
    const session: AuthSession = {
      user: mockMemberUser,
      token: "ax_member_token",
      rememberMe: false,
    };

    const html = renderToString(
      <MemoryRouter>
        <AuthSessionProvider initialSession={session}>
          <UserSessionBadge />
        </AuthSessionProvider>
      </MemoryRouter>,
    );

    expect(html).toContain("Budi Santoso");
    expect(html).toContain("Anggota Tim");
    expect(USER_ROLE_LABELS.member_team).toBe("Anggota Tim");
  });

  test("renders nothing when user is not logged in", () => {
    const html = renderToString(
      <MemoryRouter>
        <AuthSessionProvider initialSession={null}>
          <UserSessionBadge />
        </AuthSessionProvider>
      </MemoryRouter>,
    );

    expect(html).toBe("");
  });
});
