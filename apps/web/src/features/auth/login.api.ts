import type { AuthUser, LoginRequest, LoginResponse } from "@axentra/shared";
import { authUserSchema, loginResponseSchema } from "@axentra/shared";
import { z } from "zod";
import { apiRequest } from "../../lib/api-client";

export const logoutResponseSchema = z.object({
  message: z.string(),
});

export type LogoutResponse = z.infer<typeof logoutResponseSchema>;

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  return apiRequest("/auth/login", loginResponseSchema, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function getAuthMe(): Promise<AuthUser> {
  return apiRequest("/auth/me", authUserSchema, {
    method: "GET",
  });
}

export async function logout(): Promise<LogoutResponse> {
  return apiRequest("/auth/logout", logoutResponseSchema, {
    method: "POST",
  });
}
