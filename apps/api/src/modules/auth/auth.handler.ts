import type { Context } from "hono";
import { loginRequestSchema } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { jsonError, jsonSuccess } from "../../http/responses";
import { getAuthenticatedUser } from "../../middleware/auth";
import type { AuthService } from "./auth.service";

export function createMeHandler() {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const currentUser = getAuthenticatedUser(context);
    return jsonSuccess(context, currentUser, 200);
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
    const currentUser = getAuthenticatedUser(context);
    const result = await authService.refresh(currentUser);
    return jsonSuccess(context, result, 200);
  };
}

export function createLogoutHandler(authService: AuthService) {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const currentUser = getAuthenticatedUser(context);
    const result = await authService.logout(currentUser);
    return jsonSuccess(context, result, 200);
  };
}
