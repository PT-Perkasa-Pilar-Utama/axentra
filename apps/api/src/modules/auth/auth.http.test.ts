import { describe, expect, it } from "bun:test";
import { createApp } from "../../app";
import type { ApiErrorEnvelope, ApiSuccessEnvelope, LoginResponse } from "@axentra/shared";
import { createInMemoryAuthService } from "./auth.memory-stores";
import {
  cookieValueOf,
  jsonPost,
  logger,
  REFRESH_COOKIE,
  refreshCookieHeader,
  setCookieNamed,
  TEST_MEMBER,
} from "./auth.test-support";

const START = new Date("2026-10-27T08:00:00.000Z");
const LOGIN_PATH = "/api/v1/auth/login";
const REFRESH_PATH = "/api/v1/auth/refresh";
const LOGOUT_PATH = "/api/v1/auth/logout";
const ME_PATH = "/api/v1/auth/me";

type TestApp = ReturnType<typeof createApp>;

function createFixture(
  options: { appEnvironment?: "development" | "production"; webOrigin?: string } = {},
): { app: TestApp; clock: { now: Date } } {
  const clock = { now: START };
  const authService = createInMemoryAuthService({
    clock: () => clock.now,
    authenticator: (credentials) =>
      credentials.email === TEST_MEMBER.email && credentials.password === "correct-password"
        ? TEST_MEMBER
        : null,
  });
  const app = createApp({
    logger,
    version: "0.1.0",
    readinessChecks: [],
    authService,
    appEnvironment: options.appEnvironment,
    webOrigin: options.webOrigin,
  });
  return { app, clock };
}

async function login(app: TestApp, rememberMe?: boolean): Promise<Response> {
  return app.request(
    LOGIN_PATH,
    jsonPost({
      email: TEST_MEMBER.email,
      password: "correct-password",
      ...(rememberMe === undefined ? {} : { rememberMe }),
    }),
  );
}

async function refreshWith(app: TestApp, refreshToken: string): Promise<Response> {
  return app.request(REFRESH_PATH, {
    method: "POST",
    headers: refreshCookieHeader(refreshToken),
  });
}

function bearer(token: string): RequestInit {
  return { headers: { authorization: `Bearer ${token}` } };
}

// The refresh token from the login cookie. Every test here needs it, so a missing cookie fails loudly.
function refreshTokenFrom(response: Response): string {
  const setCookie = setCookieNamed(response, REFRESH_COOKIE);
  if (setCookie === undefined) throw new Error("expected a refresh cookie");
  return cookieValueOf(setCookie);
}

describe("refresh cookie attributes (A3)", () => {
  it("sets an HttpOnly, SameSite=Lax cookie scoped to /api/v1/auth, with no Secure and no Max-Age for a browser session", async () => {
    const { app } = createFixture();

    const cookie = setCookieNamed(await login(app), REFRESH_COOKIE) ?? "";

    expect(cookie.startsWith("axentra_refresh=ax_rt_")).toBe(true);
    expect(cookie).toContain("Path=/api/v1/auth");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    expect(cookie).not.toContain("Max-Age");
  });

  it("adds Max-Age=2592000 only when remember_me is chosen", async () => {
    const { app } = createFixture();

    const remembered = setCookieNamed(await login(app, true), REFRESH_COOKIE) ?? "";

    expect(remembered).toContain("Max-Age=2592000");
  });

  it("marks the cookie Secure only when APP_ENV is production", async () => {
    const development = createFixture({ appEnvironment: "development" });
    const production = createFixture({ appEnvironment: "production" });

    const developmentCookie = setCookieNamed(await login(development.app), REFRESH_COOKIE) ?? "";
    const productionCookie = setCookieNamed(await login(production.app), REFRESH_COOKIE) ?? "";

    expect(developmentCookie).not.toContain("Secure");
    expect(productionCookie).toContain("; Secure");
  });

  it("sets no refresh cookie when the password is wrong", async () => {
    const { app } = createFixture();

    const response = await app.request(
      LOGIN_PATH,
      jsonPost({ email: TEST_MEMBER.email, password: "wrong-password" }),
    );

    expect(response.status).toBe(401);
    expect(setCookieNamed(response, REFRESH_COOKIE)).toBeUndefined();
  });
});

describe("refresh and logout over the cookie (A3)", () => {
  it("refresh reads the cookie, rotates both tokens and keeps the remember_me lifetime", async () => {
    const { app } = createFixture();
    const loginResponse = await login(app, true);
    const loginBody = (await loginResponse.json()) as ApiSuccessEnvelope<LoginResponse>;
    const refreshToken = refreshTokenFrom(loginResponse);

    const response = await refreshWith(app, refreshToken);

    expect(response.status).toBe(200);
    const body = (await response.json()) as ApiSuccessEnvelope<LoginResponse>;
    expect(body.data.token).not.toBe(loginBody.data.token);
    expect(Object.keys(body.data).sort()).toEqual(["expiresAt", "token", "user"]);
    const rotated = setCookieNamed(response, REFRESH_COOKIE) ?? "";
    expect(rotated).toContain("Max-Age=2592000");
    expect(cookieValueOf(rotated)).not.toBe(refreshToken);

    const oldAccess = await app.request(ME_PATH, bearer(loginBody.data.token));
    expect(oldAccess.status).toBe(401);
    const newAccess = await app.request(ME_PATH, bearer(body.data.token));
    expect(newAccess.status).toBe(200);
  });

  it("a replayed refresh cookie returns 401, clears the cookie and revokes the whole session", async () => {
    const { app } = createFixture();
    const loginResponse = await login(app);
    const original = refreshTokenFrom(loginResponse);
    const rotatedResponse = await refreshWith(app, original);
    const rotated = refreshTokenFrom(rotatedResponse);

    const replay = await refreshWith(app, original);

    expect(replay.status).toBe(401);
    expect(setCookieNamed(replay, REFRESH_COOKIE)).toContain("Max-Age=0");
    const afterReuse = await refreshWith(app, rotated);
    expect(afterReuse.status).toBe(401);
  });

  it("refresh without a cookie returns 401 and clears the cookie", async () => {
    const { app } = createFixture();

    const response = await app.request(REFRESH_PATH, { method: "POST" });

    expect(response.status).toBe(401);
    expect(setCookieNamed(response, REFRESH_COOKIE)).toContain("Max-Age=0");
    const body = (await response.json()) as ApiErrorEnvelope;
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("refresh ignores the request body and rejects a refresh token sent only in the body", async () => {
    const { app } = createFixture();
    const refreshToken = refreshTokenFrom(await login(app));

    const bodyOnly = await app.request(REFRESH_PATH, jsonPost({ refreshToken }));

    expect(bodyOnly.status).toBe(401);
  });

  it("logout works from the cookie alone, clears it and ends the session", async () => {
    const { app } = createFixture();
    const loginResponse = await login(app);
    const loginBody = (await loginResponse.json()) as ApiSuccessEnvelope<LoginResponse>;
    const refreshToken = refreshTokenFrom(loginResponse);

    const response = await app.request(LOGOUT_PATH, {
      method: "POST",
      headers: refreshCookieHeader(refreshToken),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as ApiSuccessEnvelope<{ message: string }>;
    expect(body.data.message).toBe("Logout berhasil");
    expect(setCookieNamed(response, REFRESH_COOKIE)).toContain("Max-Age=0");
    expect((await app.request(ME_PATH, bearer(loginBody.data.token))).status).toBe(401);
    expect((await refreshWith(app, refreshToken)).status).toBe(401);
  });

  it("logout still succeeds after the access token has expired", async () => {
    const { app, clock } = createFixture();
    const loginResponse = await login(app);
    const refreshToken = refreshTokenFrom(loginResponse);
    clock.now = new Date(START.getTime() + 16 * 60 * 1000);

    const response = await app.request(LOGOUT_PATH, {
      method: "POST",
      headers: refreshCookieHeader(refreshToken),
    });

    expect(response.status).toBe(200);
    expect((await refreshWith(app, refreshToken)).status).toBe(401);
  });

  it("logout without a cookie succeeds and still clears the cookie", async () => {
    const { app } = createFixture();

    const response = await app.request(LOGOUT_PATH, { method: "POST" });

    expect(response.status).toBe(200);
    expect(setCookieNamed(response, REFRESH_COOKIE)).toContain("Max-Age=0");
  });
});

describe("CORS for the configured web origin (A5)", () => {
  async function preflight(app: TestApp, origin: string): Promise<Response> {
    return app.request(LOGIN_PATH, {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,authorization",
      },
    });
  }

  it("allows exactly the default origin, with credentials and the required headers and methods", async () => {
    const { app } = createFixture();

    const response = await preflight(app, "http://localhost:5173");

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-headers")).toBe("Content-Type,Authorization");
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET,POST,PATCH,DELETE,OPTIONS",
    );
  });

  it("does not grant any other origin", async () => {
    const { app } = createFixture();

    const response = await preflight(app, "https://evil.example");

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("sends the allow-origin header on the actual response for the configured origin", async () => {
    const { app } = createFixture();

    const response = await app.request(LOGIN_PATH, {
      ...jsonPost({ email: TEST_MEMBER.email, password: "wrong-password" }),
      headers: { "content-type": "application/json", origin: "http://localhost:5173" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("uses a configured WEB_ORIGIN instead of the default", async () => {
    const { app } = createFixture({ webOrigin: "https://web.axentra.internal" });

    expect(
      (await preflight(app, "https://web.axentra.internal")).headers.get(
        "access-control-allow-origin",
      ),
    ).toBe("https://web.axentra.internal");
    expect(
      (await preflight(app, "http://localhost:5173")).headers.get("access-control-allow-origin"),
    ).toBeNull();
  });
});
