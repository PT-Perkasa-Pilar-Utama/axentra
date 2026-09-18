import { z } from "zod";

export const userRoleSchema = z.enum(["member_team", "head_of_team"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const authUserSchema = z.object({
  id: z.string().uuid(),
  role: userRoleSchema,
  name: z.string().min(1),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginResponseSchema = z.object({
  user: authUserSchema,
  token: z.string().min(1),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;
