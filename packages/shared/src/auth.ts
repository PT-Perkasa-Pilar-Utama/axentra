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
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginResponseSchema = z.object({
  user: authUserSchema,
  token: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;
