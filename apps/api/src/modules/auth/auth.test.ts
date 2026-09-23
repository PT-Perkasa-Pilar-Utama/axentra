import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createLogger } from "@axentra/observability";
import {
  apiErrorSchema,
  type ApiErrorEnvelope,
  type ApiSuccessEnvelope,
  type AuthUser,
  type LoginResponse,
} from "@axentra/shared";
import { createApp } from "../../app";
import type { ApiEnvironment } from "../../environment";
import { isAppError } from "../../http/errors";
import { jsonError, jsonSuccess } from "../../http/responses";
import { requireAuth, requireRole } from "../../middleware/auth";
import { requestContextMiddleware } from "../../middleware/request-context";
import { loadApiConfig } from "@axentra/config";
import { createAuthService } from "./auth.service";
import { createLocalIdentityAuthenticator } from "./local-identity";
import { createRuntimeAuthenticator } from "./runtime-authenticator";

const logger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const TEST_MEMBER: AuthUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "sami@axentra.internal",
  role: "member_team",
  name: "Sami",
};

const TEST_HEAD: AuthUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "arya@axentra.internal",
  role: "head_of_team",
  name: "Arya Isnaidi",
};

describe("Auth API Module", () => {
  describe("Production Startup Defenses (F1, F2)", () => {
    // Default production app with no injected test verifier or dev authenticators
    const productionApp = createApp({
      logger,
      version: "0.1.0",
      readinessChecks: [],
    });

    it("rejects unauthenticated requests to /api/v1/auth/me with 401", async () => {
      const response = await productionApp.request("/api/v1/auth/me");
      expect(response.status).toBe(401);

      const body = (await response.json()) as ApiErrorEnvelope;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toBe("Autentikasi diperlukan");
    });

    it("rejects forged x-user-id and x-user-role headers with 401 (F1)", async () => {
      const response = await productionApp.request("/api/v1/auth/me", {
        headers: {
          "x-user-id": "22222222-2222-4222-8222-222222222222",
          "x-user-role": "head_of_team",
          "x-user-name": "Attacker",
        },
      });
      expect(response.status).toBe(401);

      const body = (await response.json()) as ApiErrorEnvelope;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toBe("Autentikasi diperlukan");
    });

    it("rejects hardcoded development bearer tokens in production (F2)", async () => {
      const memberResponse = await productionApp.request("/api/v1/auth/me", {
        headers: { authorization: "Bearer dev-token-member" },
      });
      expect(memberResponse.status).toBe(401);

      const headResponse = await productionApp.request("/api/v1/auth/me", {
        headers: { authorization: "Bearer dev-token-head" },
      });
      expect(headResponse.status).toBe(401);
    });

    it("rejects login attempts when the runtime has no identity directory (F2)", async () => {
      const response = await productionApp.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "sami@axentra.internal",
          password: "password123",
        }),
      });
      expect(response.status).toBe(401);

      const body = (await response.json()) as ApiErrorEnvelope;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toBe("Email atau kata sandi salah");
    });
  });

  describe("Session & Token Lifecycle with Injected AuthService", () => {
    let currentTime = 1_000_000_000;
    const authService = createAuthService({
      clock: () => currentTime,
      accessTokenTtlMs: 15 * 60 * 1000, // 15 mins
      refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      authenticator: (credentials) => {
        if (
          credentials.email === TEST_MEMBER.email &&
          credentials.password === "correct-password"
        ) {
          return TEST_MEMBER;
        }
        if (credentials.email === TEST_HEAD.email && credentials.password === "head-secret") {
          return TEST_HEAD;
        }
        return null;
      },
    });

    const app = createApp({
      logger,
      version: "0.1.0",
      readinessChecks: [],
      authService,
    });

    describe("POST /api/v1/auth/login", () => {
      it("returns 200 with tokens and user on valid member credentials", async () => {
        const response = await app.request("/api/v1/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "sami@axentra.internal",
            password: "correct-password",
          }),
        });
        expect(response.status).toBe(200);

        const body = (await response.json()) as ApiSuccessEnvelope<LoginResponse>;
        expect(body.success).toBe(true);
        expect(body.data.user.id).toBe(TEST_MEMBER.id);
        expect(body.data.user.email).toBe(TEST_MEMBER.email);
        expect(body.data.user.role).toBe("member_team");
        expect(body.data.token).toStartWith("ax_");
        expect(body.data.refreshToken).toBeDefined();
      });

      it("returns 401 when password is wrong", async () => {
        const response = await app.request("/api/v1/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "sami@axentra.internal",
            password: "wrong-password",
          }),
        });
        expect(response.status).toBe(401);

        const body = (await response.json()) as ApiErrorEnvelope;
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("UNAUTHORIZED");
        expect(body.error.message).toBe("Email atau kata sandi salah");
      });

      it("returns 400 on invalid body format", async () => {
        const response = await app.request("/api/v1/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "not-an-email",
            password: "",
          }),
        });
        expect(response.status).toBe(400);

        const body = (await response.json()) as ApiErrorEnvelope;
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("VALIDATION_ERROR");
      });
    });

    describe("GET /api/v1/auth/me", () => {
      it("returns 200 with authenticated user when valid token is supplied", async () => {
        const loginRes = await app.request("/api/v1/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "arya@axentra.internal",
            password: "head-secret",
          }),
        });
        const loginData = (await loginRes.json()) as ApiSuccessEnvelope<LoginResponse>;
        const token = loginData.data.token;

        const response = await app.request("/api/v1/auth/me", {
          headers: { authorization: `Bearer ${token}` },
        });
        expect(response.status).toBe(200);

        const body = (await response.json()) as ApiSuccessEnvelope<AuthUser>;
        expect(body.success).toBe(true);
        expect(body.data.id).toBe(TEST_HEAD.id);
        expect(body.data.email).toBe(TEST_HEAD.email);
        expect(body.data.role).toBe("head_of_team");
        expect(body.data.name).toBe("Arya Isnaidi");
      });

      it("returns 401 when token has expired", async () => {
        const loginRes = await app.request("/api/v1/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "sami@axentra.internal",
            password: "correct-password",
          }),
        });
        const loginData = (await loginRes.json()) as ApiSuccessEnvelope<LoginResponse>;
        const token = loginData.data.token;

        // Advance time past 15-minute access token TTL
        currentTime += 16 * 60 * 1000;

        const response = await app.request("/api/v1/auth/me", {
          headers: { authorization: `Bearer ${token}` },
        });
        expect(response.status).toBe(401);

        const body = (await response.json()) as ApiErrorEnvelope;
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("UNAUTHORIZED");
        expect(body.error.message).toBe("Token tidak valid atau telah kedaluwarsa");
      });
    });

    describe("POST /api/v1/auth/refresh and POST /api/v1/auth/logout", () => {
      it("refreshes active session and rotates token", async () => {
        const loginRes = await app.request("/api/v1/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "sami@axentra.internal",
            password: "correct-password",
          }),
        });
        const loginData = (await loginRes.json()) as ApiSuccessEnvelope<LoginResponse>;
        const oldToken = loginData.data.token;
        const refreshToken = loginData.data.refreshToken ?? "";

        // Refresh session
        const refreshRes = await app.request("/api/v1/auth/refresh", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        expect(refreshRes.status).toBe(200);

        const refreshData = (await refreshRes.json()) as ApiSuccessEnvelope<{
          token: string;
          refreshToken: string;
        }>;
        const newToken = refreshData.data.token;
        expect(newToken).not.toBe(oldToken);

        // Old token should now be invalid
        const oldTokenCheck = await app.request("/api/v1/auth/me", {
          headers: { authorization: `Bearer ${oldToken}` },
        });
        expect(oldTokenCheck.status).toBe(401);

        // New token works
        const newTokenCheck = await app.request("/api/v1/auth/me", {
          headers: { authorization: `Bearer ${newToken}` },
        });
        expect(newTokenCheck.status).toBe(200);

        // Using the same refresh token again fails (rotation)
        const replayedRefresh = await app.request("/api/v1/auth/refresh", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        expect(replayedRefresh.status).toBe(401);
      });

      it("invalidates token on logout so subsequent requests fail", async () => {
        const loginRes = await app.request("/api/v1/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "sami@axentra.internal",
            password: "correct-password",
          }),
        });
        const loginData = (await loginRes.json()) as ApiSuccessEnvelope<LoginResponse>;
        const token = loginData.data.token;

        // Logout
        const logoutRes = await app.request("/api/v1/auth/logout", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        });
        expect(logoutRes.status).toBe(200);

        const logoutData = (await logoutRes.json()) as ApiSuccessEnvelope<{ message: string }>;
        expect(logoutData.data.message).toBe("Logout berhasil");

        // Subsequent /me returns 401
        const meRes = await app.request("/api/v1/auth/me", {
          headers: { authorization: `Bearer ${token}` },
        });
        expect(meRes.status).toBe(401);
      });
    });
  });

  describe("requireRole Middleware & RBAC enforcement (F1, F3)", () => {
    const authService = createAuthService({
      authenticator: (credentials) => {
        if (credentials.email === TEST_MEMBER.email) return TEST_MEMBER;
        if (credentials.email === TEST_HEAD.email) return TEST_HEAD;
        return null;
      },
    });

    const testApp = new Hono<ApiEnvironment>();
    testApp.use("*", requestContextMiddleware(logger));

    // Route only accessible to head_of_team
    testApp.get(
      "/head-only",
      requireAuth(authService.tokenVerifier),
      requireRole("head_of_team"),
      (c) => jsonSuccess(c, { allowed: true }),
    );

    // Simulated /documents/upload route requiring member_team
    testApp.post(
      "/documents/upload",
      requireAuth(authService.tokenVerifier),
      requireRole("member_team"),
      (c) => jsonSuccess(c, { uploadAccepted: true }),
    );

    testApp.onError((error, context) => {
      if (isAppError(error)) {
        return jsonError(context, error.code, error.message, error.status, error.details);
      }
      return jsonError(context, "INTERNAL_ERROR", "Terjadi kesalahan", 500);
    });

    it("returns 403 when member_team tries to access head_of_team route", async () => {
      const loginRes = await authService.login({
        email: TEST_MEMBER.email,
        password: "any",
      });

      const response = await testApp.request("/head-only", {
        headers: { authorization: `Bearer ${loginRes.token}` },
      });
      expect(response.status).toBe(403);

      const body = (await response.json()) as ApiErrorEnvelope;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toBe("Anda tidak memiliki akses untuk tindakan ini");
    });

    it("returns 200 when head_of_team accesses head_of_team route", async () => {
      const loginRes = await authService.login({
        email: TEST_HEAD.email,
        password: "any",
      });

      const response = await testApp.request("/head-only", {
        headers: { authorization: `Bearer ${loginRes.token}` },
      });
      expect(response.status).toBe(200);

      const body = (await response.json()) as ApiSuccessEnvelope<{ allowed: boolean }>;
      expect(body.success).toBe(true);
      expect(body.data.allowed).toBe(true);
    });

    it("exercises simulated /documents/upload route with member_team token", async () => {
      const loginRes = await authService.login({
        email: TEST_MEMBER.email,
        password: "any",
      });

      const response = await testApp.request("/documents/upload", {
        method: "POST",
        headers: { authorization: `Bearer ${loginRes.token}` },
      });
      expect(response.status).toBe(200);

      const body = (await response.json()) as ApiSuccessEnvelope<{ uploadAccepted: boolean }>;
      expect(body.success).toBe(true);
      expect(body.data.uploadAccepted).toBe(true);
    });

    it("returns 403 when head_of_team accesses member-only /documents/upload route", async () => {
      const loginRes = await authService.login({
        email: TEST_HEAD.email,
        password: "any",
      });

      const response = await testApp.request("/documents/upload", {
        method: "POST",
        headers: { authorization: `Bearer ${loginRes.token}` },
      });
      expect(response.status).toBe(403);
    });
  });

  describe("App and AuthService Composition (F6)", () => {
    it("selects authService.tokenVerifier when only authService is injected in createApp", async () => {
      const authService = createAuthService({
        authenticator: (credentials) => {
          if (
            credentials.email === TEST_MEMBER.email &&
            credentials.password === "correct-password"
          ) {
            return TEST_MEMBER;
          }
          return null;
        },
      });

      // Inject ONLY authService without passing tokenVerifier
      const app = createApp({
        logger,
        version: "0.1.0",
        readinessChecks: [],
        authService,
      });

      // 1. Login via /login
      const loginRes = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: TEST_MEMBER.email,
          password: "correct-password",
        }),
      });
      expect(loginRes.status).toBe(200);

      const loginData = (await loginRes.json()) as ApiSuccessEnvelope<LoginResponse>;
      const token = loginData.data.token;

      // 2. Access /api/v1/auth/me with issued token -> MUST return 200 with user
      const meRes = await app.request("/api/v1/auth/me", {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(meRes.status).toBe(200);

      const meData = (await meRes.json()) as ApiSuccessEnvelope<AuthUser>;
      expect(meData.success).toBe(true);
      expect(meData.data.id).toBe(TEST_MEMBER.id);
      expect(meData.data.email).toBe(TEST_MEMBER.email);
      expect(meData.data.role).toBe("member_team");
    });

    it("wires runtime authService from server.ts and fails closed for unconfigured logins", async () => {
      const serverApp = createApp({
        logger,
        version: "0.1.0",
        readinessChecks: [],
        authService: createAuthService(),
      });

      // Credential logins fail closed with 401
      const loginRes = await serverApp.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "sami@axentra.internal",
          password: "password123",
        }),
      });
      expect(loginRes.status).toBe(401);

      // Unauthenticated /me fails closed with 401
      const meRes = await serverApp.request("/api/v1/auth/me");
      expect(meRes.status).toBe(401);
    });

    it("issues a bearer token from the configured local identity directory [BE-S1-01]", async () => {
      const directory = Buffer.from(
        JSON.stringify([
          {
            id: TEST_MEMBER.id,
            email: TEST_MEMBER.email,
            role: TEST_MEMBER.role,
            name: TEST_MEMBER.name,
            passwordHash: await Bun.password.hash("local-member-password"),
          },
        ]),
      ).toString("base64");
      const authService = createAuthService({
        authenticator: createLocalIdentityAuthenticator(directory),
      });
      const app = createApp({
        logger,
        version: "0.1.0",
        readinessChecks: [],
        authService,
      });

      const rejected = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: TEST_MEMBER.email,
          password: "wrong-password",
        }),
      });
      expect(rejected.status).toBe(401);

      const loginRes = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: TEST_MEMBER.email,
          password: "local-member-password",
        }),
      });
      expect(loginRes.status).toBe(200);
      const loginBody = (await loginRes.json()) as ApiSuccessEnvelope<LoginResponse>;
      expect(loginBody.data.token).toStartWith("ax_");
      expect(loginBody.data.user.role).toBe("member_team");

      const meRes = await app.request("/api/v1/auth/me", {
        headers: { authorization: `Bearer ${loginBody.data.token}` },
      });
      expect(meRes.status).toBe(200);
      const meBody = (await meRes.json()) as ApiSuccessEnvelope<AuthUser>;
      expect(meBody.data.email).toBe(TEST_MEMBER.email);
    });

    it("rejects the tracked development credentials when APP_ENV is production [BE-S1-01]", async () => {
      const authService = createAuthService({
        authenticator: createRuntimeAuthenticator(
          runtimeConfig("production", await memberDirectory()),
        ),
      });
      const app = createApp({
        logger,
        version: "0.1.0",
        readinessChecks: [],
        authService,
      });

      const response = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "member@axentra.local",
          password: "local-member-password",
        }),
      });
      expect(response.status).toBe(401);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("accepts the tracked development credentials when APP_ENV is development [BE-S1-01]", async () => {
      const app = createApp({
        logger,
        version: "0.1.0",
        readinessChecks: [],
        authService: createAuthService({
          authenticator: createRuntimeAuthenticator(
            runtimeConfig("development", await memberDirectory()),
          ),
        }),
      });
      const response = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "member@axentra.local",
          password: "local-member-password",
        }),
      });
      expect(response.status).toBe(200);
    });

    it("fails startup when the development identity directory is missing or malformed [BE-S1-01]", () => {
      expect(() =>
        loadApiConfig({
          ...runtimeEnvironment("development"),
          AUTH_LOCAL_IDENTITY_DIRECTORY: undefined,
        }),
      ).toThrow("AUTH_LOCAL_IDENTITY_DIRECTORY");
      const malformed = loadApiConfig({
        ...runtimeEnvironment("development"),
        AUTH_LOCAL_IDENTITY_DIRECTORY: "not-a-directory",
      });
      expect(() => createRuntimeAuthenticator(malformed)).toThrow("AUTH_LOCAL_IDENTITY_DIRECTORY");
    });

    it("rejects production login when the identity directory is malformed [BE-S1-01]", async () => {
      expect(() =>
        loadApiConfig({
          ...runtimeEnvironment("production"),
          AUTH_LOCAL_IDENTITY_DIRECTORY: undefined,
        }),
      ).toThrow("AUTH_LOCAL_IDENTITY_DIRECTORY");

      const app = createApp({
        logger,
        version: "0.1.0",
        readinessChecks: [],
        authService: createAuthService({
          authenticator: createRuntimeAuthenticator(runtimeConfig("production", "not-a-directory")),
        }),
      });
      const response = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "member@axentra.local",
          password: "local-member-password",
        }),
      });
      expect(response.status).toBe(401);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe("UNAUTHORIZED");
    });
  });
});

function runtimeEnvironment(appEnv: "development" | "production"): Record<string, string> {
  return {
    APP_ENV: appEnv,
    APP_VERSION: "0.1.0",
    DATABASE_URL: "postgres://axentra:test@localhost:5432/axentra_test",
    REDIS_URL: "redis://localhost:6379/0",
    S3_PROVIDER: "minio",
    S3_ENDPOINT: "http://localhost:9000",
    S3_REGION: "ap-southeast-3",
    S3_BUCKET: "axentra-test",
    S3_ACCESS_KEY_ID: "local-test-user",
    S3_SECRET_ACCESS_KEY: "local-test-password",
    S3_FORCE_PATH_STYLE: "true",
  };
}

function runtimeConfig(
  appEnv: "development" | "production",
  directory: string,
): ReturnType<typeof loadApiConfig> {
  return loadApiConfig({
    ...runtimeEnvironment(appEnv),
    AUTH_LOCAL_IDENTITY_DIRECTORY: directory,
  });
}

async function memberDirectory(): Promise<string> {
  return Buffer.from(
    JSON.stringify([
      {
        id: "11111111-1111-4111-8111-111111111111",
        email: "member@axentra.local",
        role: "member_team",
        name: "Member Team",
        passwordHash: await Bun.password.hash("local-member-password"),
      },
    ]),
  ).toString("base64");
}
