import { createMiddleware } from "hono/factory";
import type { Context, MiddlewareHandler } from "hono";
import type { AuthUser, UserRole } from "@axentra/shared";
import { authUserSchema } from "@axentra/shared";
import type { ApiEnvironment } from "../environment";
import { ForbiddenError, UnauthorizedError } from "../http/errors";

// TODO(BE-S1-01): Sebelum ke production, dev-auth HARUS diganti dengan JWT atau session-based auth yang proper.

export type DevUserAccount = AuthUser & {
  email: string;
  token: string;
};

export const DEV_USERS: ReadonlyArray<DevUserAccount> = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    role: "member_team",
    name: "Sami",
    email: "sami@axentra.internal",
    token: "dev-token-member",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    role: "head_of_team",
    name: "Arya Isnaidi",
    email: "arya@axentra.internal",
    token: "dev-token-head",
  },
];

export function getAuthenticatedUser(context: Context<ApiEnvironment>): AuthUser {
  const user = context.get("currentUser");
  if (user === undefined) {
    throw new UnauthorizedError("Autentikasi diperlukan");
  }
  return user;
}

export function authMiddleware(): MiddlewareHandler<ApiEnvironment> {
  return createMiddleware<ApiEnvironment>(async (context, next) => {
    // TODO(BE-S1-01): Sebelum ke production, dev-auth header-based HARUS diganti dengan JWT atau session-based auth yang proper.
    const authHeader = context.req.header("authorization");
    if (authHeader !== undefined && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      const matchedUser = DEV_USERS.find((user) => user.token === token);
      if (matchedUser !== undefined) {
        context.set("currentUser", {
          id: matchedUser.id,
          role: matchedUser.role,
          name: matchedUser.name,
        });
        await next();
        return;
      }
    }

    const userId = context.req.header("x-user-id")?.trim();
    const userRole = context.req.header("x-user-role")?.trim();
    const userName = context.req.header("x-user-name")?.trim();

    if (userId !== undefined && userRole !== undefined) {
      const parsed = authUserSchema.safeParse({
        id: userId,
        role: userRole,
        name: userName !== undefined && userName.length > 0 ? userName : "Pengguna",
      });

      if (parsed.success) {
        context.set("currentUser", parsed.data);
        await next();
        return;
      }
    }

    throw new UnauthorizedError("Autentikasi diperlukan");
  });
}

export function requireRole(
  ...allowedRoles: ReadonlyArray<UserRole>
): MiddlewareHandler<ApiEnvironment> {
  return createMiddleware<ApiEnvironment>(async (context, next) => {
    const user = getAuthenticatedUser(context);
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenError("Anda tidak memiliki akses untuk tindakan ini");
    }
    await next();
  });
}
