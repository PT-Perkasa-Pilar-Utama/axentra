import type { Context } from "hono";
import { loginRequestSchema } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { UnauthorizedError } from "../../http/errors";
import { jsonError, jsonSuccess } from "../../http/responses";
import { getAuthenticatedUser } from "../../middleware/auth";
import {
  clearRefreshCookie,
  readRefreshCookie,
  writeRefreshCookie,
  type RefreshCookieSettings,
} from "./auth.cookie";
import type { AuthService } from "./auth.service";

export function createMeHandler() {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const user = getAuthenticatedUser(context);
    return jsonSuccess(context, user, 200);
  };
}

export function createLoginHandler(authService: AuthService, cookies: RefreshCookieSettings) {
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

    const { refreshToken, rememberMe, ...body } = await authService.login(parsed.data);
    writeRefreshCookie(context, refreshToken, rememberMe, cookies);
    return jsonSuccess(context, body, 200);
  };
}

// The refresh token travels only in the HttpOnly cookie. Any 401 clears the cookie so the browser stops
// presenting a token the server no longer accepts.
export function createRefreshHandler(authService: AuthService, cookies: RefreshCookieSettings) {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    try {
      const { refreshToken, rememberMe, ...body } = await authService.refresh(
        readRefreshCookie(context),
      );
      writeRefreshCookie(context, refreshToken, rememberMe, cookies);
      return jsonSuccess(context, body, 200);
    } catch (error: unknown) {
      if (error instanceof UnauthorizedError) clearRefreshCookie(context, cookies);
      throw error;
    }
  };
}

// Logout revokes the session identified by the refresh cookie. It does not require a valid access token,
// so an expired access token cannot block logout.
export function createLogoutHandler(authService: AuthService, cookies: RefreshCookieSettings) {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const result = await authService.logout(readRefreshCookie(context));
    clearRefreshCookie(context, cookies);
    return jsonSuccess(context, result, 200);
  };
}
