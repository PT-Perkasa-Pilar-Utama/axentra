import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createLogger } from "@axentra/observability";
import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  AuthUser,
  LoginResponse,
} from "@axentra/shared";
import { createApp } from "../../app";
import type { ApiEnvironment } from "../../environment";
import { isAppError } from "../../http/errors";
import { jsonError, jsonSuccess } from "../../http/responses";
import { authMiddleware, requireRole } from "../../middleware/auth";
import { requestContextMiddleware } from "../../middleware/request-context";

const logger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const app = createApp({
  logger,
  version: "0.1.0",
  readinessChecks: [],
});

describe("Auth API Module", () => {
  describe("GET /api/v1/auth/me", () => {
    it("returns 401 when no auth headers or token are provided", async () => {
      const response = await app.request("/api/v1/auth/me");
      expect(response.status).toBe(401);

      const body = (await response.json()) as ApiErrorEnvelope;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toBe("Autentikasi diperlukan");
    });

    it("returns 401 when role is invalid", async () => {
      const response = await app.request("/api/v1/auth/me", {
        headers: {
          "x-user-id": "11111111-1111-4111-8111-111111111111",
          "x-user-role": "superadmin",
          "x-user-name": "Sami",
        },
      });
      expect(response.status).toBe(401);
      const body = (await response.json()) as ApiErrorEnvelope;
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 when id is not a valid UUID", async () => {
      const response = await app.request("/api/v1/auth/me", {
        headers: {
          "x-user-id": "invalid-uuid",
          "x-user-role": "member_team",
        },
      });
      expect(response.status).toBe(401);
    });

    it("returns 200 with user data for valid member_team headers", async () => {
      const response = await app.request("/api/v1/auth/me", {
        headers: {
          "x-user-id": "11111111-1111-4111-8111-111111111111",
          "x-user-role": "member_team",
          "x-user-name": "Sami",
        },
      });
      expect(response.status).toBe(200);

      const body = (await response.json()) as ApiSuccessEnvelope<AuthUser>;
      expect(body.success).toBe(true);
      expect(body.data.id).toBe("11111111-1111-4111-8111-111111111111");
      expect(body.data.role).toBe("member_team");
      expect(body.data.name).toBe("Sami");
    });

    it("returns 200 with user data for valid head_of_team headers", async () => {
      const response = await app.request("/api/v1/auth/me", {
        headers: {
          "x-user-id": "22222222-2222-4222-8222-222222222222",
          "x-user-role": "head_of_team",
          "x-user-name": "Arya Isnaidi",
        },
      });
      expect(response.status).toBe(200);

      const body = (await response.json()) as ApiSuccessEnvelope<AuthUser>;
      expect(body.success).toBe(true);
      expect(body.data.role).toBe("head_of_team");
    });

    it("returns 200 when authenticated via valid Bearer token", async () => {
      const response = await app.request("/api/v1/auth/me", {
        headers: {
          authorization: "Bearer dev-token-member",
        },
      });
      expect(response.status).toBe(200);

      const body = (await response.json()) as ApiSuccessEnvelope<AuthUser>;
      expect(body.success).toBe(true);
      expect(body.data.role).toBe("member_team");
      expect(body.data.name).toBe("Sami");
    });

    it("returns 401 when authenticated via invalid Bearer token", async () => {
      const response = await app.request("/api/v1/auth/me", {
        headers: {
          authorization: "Bearer invalid-token",
        },
      });
      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("returns 200 with token and user on valid member credentials", async () => {
      const response = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "sami@axentra.internal",
          password: "password123",
        }),
      });
      expect(response.status).toBe(200);

      const body = (await response.json()) as ApiSuccessEnvelope<LoginResponse>;
      expect(body.success).toBe(true);
      expect(body.data.user.role).toBe("member_team");
      expect(body.data.token).toBe("dev-token-member");
    });

    it("returns 200 with token and user on valid head_of_team credentials", async () => {
      const response = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "arya@axentra.internal",
          password: "password123",
        }),
      });
      expect(response.status).toBe(200);

      const body = (await response.json()) as ApiSuccessEnvelope<LoginResponse>;
      expect(body.success).toBe(true);
      expect(body.data.user.role).toBe("head_of_team");
      expect(body.data.token).toBe("dev-token-head");
    });

    it("returns 401 when password is incorrect", async () => {
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

    it("returns 401 when user does not exist", async () => {
      const response = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "nonexistent@axentra.internal",
          password: "password123",
        }),
      });
      expect(response.status).toBe(401);
    });

    it("returns 400 on invalid body schema", async () => {
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

  describe("POST /api/v1/auth/refresh", () => {
    it("returns 401 without auth", async () => {
      const response = await app.request("/api/v1/auth/refresh", { method: "POST" });
      expect(response.status).toBe(401);
    });

    it("returns 200 with refreshed token when authenticated", async () => {
      const response = await app.request("/api/v1/auth/refresh", {
        method: "POST",
        headers: {
          authorization: "Bearer dev-token-member",
        },
      });
      expect(response.status).toBe(200);

      const body = (await response.json()) as ApiSuccessEnvelope<{ token: string }>;
      expect(body.success).toBe(true);
      expect(typeof body.data.token).toBe("string");
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("returns 401 without auth", async () => {
      const response = await app.request("/api/v1/auth/logout", { method: "POST" });
      expect(response.status).toBe(401);
    });

    it("returns 200 with confirmation message when authenticated", async () => {
      const response = await app.request("/api/v1/auth/logout", {
        method: "POST",
        headers: {
          authorization: "Bearer dev-token-member",
        },
      });
      expect(response.status).toBe(200);

      const body = (await response.json()) as ApiSuccessEnvelope<{ message: string }>;
      expect(body.success).toBe(true);
      expect(body.data.message).toBe("Logout berhasil");
    });
  });

  describe("requireRole middleware", () => {
    const testApp = new Hono<ApiEnvironment>();
    testApp.use("*", requestContextMiddleware(logger));
    testApp.get("/head-only", authMiddleware(), requireRole("head_of_team"), (c) =>
      jsonSuccess(c, { allowed: true }),
    );
    testApp.onError((error, context) => {
      if (isAppError(error)) {
        return jsonError(context, error.code, error.message, error.status, error.details);
      }
      return jsonError(context, "INTERNAL_ERROR", "Terjadi kesalahan", 500);
    });

    it("returns 403 when member_team tries to access head_of_team route", async () => {
      const response = await testApp.request("/head-only", {
        headers: {
          authorization: "Bearer dev-token-member",
        },
      });
      expect(response.status).toBe(403);

      const body = (await response.json()) as ApiErrorEnvelope;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toBe("Anda tidak memiliki akses untuk tindakan ini");
    });

    it("returns 200 when head_of_team accesses head_of_team route", async () => {
      const response = await testApp.request("/head-only", {
        headers: {
          authorization: "Bearer dev-token-head",
        },
      });
      expect(response.status).toBe(200);

      const body = (await response.json()) as ApiSuccessEnvelope<{ allowed: boolean }>;
      expect(body.success).toBe(true);
      expect(body.data.allowed).toBe(true);
    });
  });
});
