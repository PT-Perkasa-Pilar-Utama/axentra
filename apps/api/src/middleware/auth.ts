import { createMiddleware } from "hono/factory";
import type { Context, MiddlewareHandler } from "hono";
import type { AuthUser, UserRole } from "@axentra/shared";
import type { ApiEnvironment } from "../environment";
import { ForbiddenError, UnauthorizedError } from "../http/errors";

export type TokenVerifier = {
  verifyToken: (token: string) => Promise<AuthUser | null> | AuthUser | null;
};

export const defaultTokenVerifier: TokenVerifier = {
  verifyToken(_token: string): AuthUser | null {
    // Production token verifier: server-side signed token and session verification
    // is specified in BE-S1-01. Unsigned, forged, or arbitrary tokens are rejected.
    return null;
  },
};

export function getAuthenticatedUser(context: Context<ApiEnvironment>): AuthUser {
  const user = context.get("user");
  if (!user) {
    throw new UnauthorizedError("Autentikasi diperlukan");
  }
  return user;
}

export function requireAuth(
  verifier: TokenVerifier = defaultTokenVerifier,
): MiddlewareHandler<ApiEnvironment> {
  return createMiddleware<ApiEnvironment>(async (context, next) => {
    const authHeader = context.req.header("authorization")?.trim();
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      throw new UnauthorizedError("Autentikasi diperlukan");
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedError("Autentikasi diperlukan");
    }

    const user = await verifier.verifyToken(token);
    if (!user) {
      throw new UnauthorizedError("Token tidak valid atau telah kedaluwarsa");
    }

    context.set("user", user);
    await next();
  });
}

export function requireRole(
  allowedRole: UserRole | ReadonlyArray<UserRole>,
): MiddlewareHandler<ApiEnvironment> {
  return createMiddleware<ApiEnvironment>(async (context, next) => {
    const user = context.get("user");
    if (!user) {
      throw new UnauthorizedError("Autentikasi diperlukan");
    }

    const isAllowed = Array.isArray(allowedRole)
      ? allowedRole.includes(user.role)
      : user.role === allowedRole;

    if (!isAllowed) {
      throw new ForbiddenError("Anda tidak memiliki akses untuk tindakan ini");
    }

    await next();
  });
}
