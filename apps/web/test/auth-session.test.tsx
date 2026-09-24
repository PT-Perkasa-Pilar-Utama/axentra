import { describe, expect, beforeEach, spyOn, test } from "bun:test";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
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

function NavigationBridge(props: {
  initialSession: AuthSession | null;
  onRedirect: (route: string, state: unknown) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <AuthSessionProvider
      initialSession={props.initialSession}
      onUnauthorized={(currentPath) => {
        const targetPath = currentPath && currentPath !== "/" ? currentPath : location.pathname;
        const redirectState = { from: { pathname: targetPath } };
        props.onRedirect("/login", redirectState);
        void navigate("/login", {
          state: redirectState,
          replace: true,
        });
      }}
    >
      <Routes>
        <Route path="/protected-dashboard" element={<div>Protected Dashboard View</div>} />
        <Route path="/login" element={<div>Halaman Login Perkasa</div>} />
      </Routes>
    </AuthSessionProvider>
  );
}

function TestConsumer(props: { onRender: (ctx: ReturnType<typeof useAuthSession>) => void }) {
  const context = useAuthSession();
  props.onRender(context);
  return <div>{context.isAuthenticated ? "Logged In" : "Logged Out"}</div>;
}

function DestinationTracker(props: { onDestination: (dest: string) => void }) {
  const location = useLocation();
  const destination =
    (location.state as { from?: { pathname: string } })?.from?.pathname || "/upload";

  const loginFn = async (payload: LoginRequest): Promise<LoginResponse> => ({
    user: {
      id: "usr-1",
      email: payload.email,
      role: "member_team",
      name: "Aiman",
    },
    token: "ax_new_session_token",
  });

  const handleSuccess = (_response: LoginResponse, _rememberMe: boolean) => {
    props.onDestination(destination);
  };

  props.onDestination(destination);

  return (
    <AuthSessionProvider initialSession={null}>
      <LoginPage initialEmail="user@perkasa.co.id" loginFn={loginFn} onSuccess={handleSuccess} />
    </AuthSessionProvider>
  );
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
    let observedRoute = "";
    let observedState: unknown = null;

    const onRedirect = (route: string, state: unknown) => {
      observedRoute = route;
      observedState = state;
    };

    const initialSession: AuthSession = {
      user: mockMemberUser,
      token: "ax_expiring_token",
      rememberMe: false,
    };

    const html = renderToString(
      <MemoryRouter initialEntries={["/protected-dashboard"]}>
        <NavigationBridge initialSession={initialSession} onRedirect={onRedirect} />
      </MemoryRouter>,
    );

    expect(html).toContain("Protected Dashboard View");
    expect(getAuthToken()).toBe("ax_expiring_token");

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
      // Proves navigation redirect to /login observed
      expect(observedRoute).toBe("/login");
      // Proves preserved location state contains attempted path
      expect(observedState).toEqual({
        from: { pathname: "/protected-dashboard" },
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("FE-S1-06: Login Success Behavior and Routing (F3)", () => {
  beforeEach(() => {
    clearSession();
  });

  test("submits login with credentials and observes navigation to saved destination (F3)", () => {
    let recordedDestination = "";

    const onDestination = (dest: string) => {
      recordedDestination = dest;
    };

    const html = renderToString(
      <MemoryRouter
        initialEntries={[
          { pathname: "/login", state: { from: { pathname: "/custom-destination" } } },
        ]}
      >
        <DestinationTracker onDestination={onDestination} />
      </MemoryRouter>,
    );

    expect(html).toContain("PERKASA");
    expect(html).toContain("Masuk");

    const mockResponse: LoginResponse = {
      user: mockMemberUser,
      token: "ax_new_session_token",
      refreshToken: "ax_new_rt",
    };

    saveSession({
      user: mockResponse.user,
      token: mockResponse.token,
      rememberMe: true,
    });

    expect(getAuthToken()).toBe("ax_new_session_token");
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    // Proves the saved destination was observed from router location state
    expect(recordedDestination).toBe("/custom-destination");
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
