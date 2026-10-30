import { z } from "zod";

export const USER_ROLES = ["member_team", "head_of_team", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const userRoleSchema = z.enum(USER_ROLES);

export const authUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  role: userRoleSchema,
  name: z.string().optional(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export function isValidUserRole(role: string): role is UserRole {
  return USER_ROLES.some((r) => r === role);
}

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

// Response of POST /auth/login and POST /auth/refresh. The refresh token is an HttpOnly cookie and is
// never part of the body.
export const loginResponseSchema = z.object({
  user: authUserSchema,
  token: z.string().min(1),
  expiresAt: z.iso.datetime(),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;
