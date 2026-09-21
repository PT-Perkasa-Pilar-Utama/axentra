import type { Context } from "hono";
import { loginRequestSchema } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { UnauthorizedError } from "../../http/errors";
import { jsonError, jsonSuccess } from "../../http/responses";
import { getAuthenticatedUser } from "../../middleware/auth";
import type { AuthService } from "./auth.service";

export function createMeHandler() {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const user = getAuthenticatedUser(context);
    return jsonSuccess(context, user, 200);
  };
}

export function createLoginHandler(authService: AuthService) {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const rawBody: unknown = await context.req.json().catch(() => null);
    const parsed = loginRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        field: issue.path.map(String).join("."),
        message: issue.message,
      }));
      return jsonError(context, "VALIDATION_ERROR", "Data tidak valid", 400, details);
    }

    const result = await authService.login(parsed.data);
    return jsonSuccess(context, result, 200);
  };
}

export function createRefreshHandler(authService: AuthService) {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const rawBody: unknown = await context.req.json().catch(() => null);
    let refreshToken: string | undefined;

    if (typeof rawBody === "object" && rawBody !== null && "refreshToken" in rawBody) {
      refreshToken = String((rawBody as { refreshToken: unknown }).refreshToken);
    }

    if (!refreshToken) {
      const authHeader = context.req.header("authorization")?.trim();
      if (authHeader?.toLowerCase().startsWith("bearer ")) {
        refreshToken = authHeader.slice(7).trim();
      }
    }

    if (!refreshToken) {
      throw new UnauthorizedError("Autentikasi diperlukan");
    }

    const result = await authService.refresh(refreshToken);
    return jsonSuccess(context, result, 200);
  };
}

export function createLogoutHandler(authService: AuthService) {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const authHeader = context.req.header("authorization")?.trim();
    const token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    const result = await authService.logout(token);
    return jsonSuccess(context, result, 200);
  };
}
