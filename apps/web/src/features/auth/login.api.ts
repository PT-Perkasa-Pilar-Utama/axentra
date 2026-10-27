import type { LoginRequest, LoginResponse } from "@axentra/shared";
import { loginResponseSchema } from "@axentra/shared";
import { z } from "zod";
import { apiRequest, type ApiRequestOptions } from "../../lib/api-client";

/** Endpoint sesi: tidak memakai bearer token dan 401 di sini tidak memicu pengalihan. */
const SESSION_ENDPOINT: ApiRequestOptions = { sessionEndpoint: true };

export const logoutResponseSchema = z.object({
  message: z.string(),
});

export type LogoutResponse = z.infer<typeof logoutResponseSchema>;

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  return apiRequest(
    "/auth/login",
    loginResponseSchema,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    SESSION_ENDPOINT,
  );
}

/** POST /auth/refresh memakai cookie axentra_refresh; 401 berarti tidak ada sesi valid. */
export async function refreshSession(): Promise<LoginResponse> {
  return apiRequest("/auth/refresh", loginResponseSchema, { method: "POST" }, SESSION_ENDPOINT);
}

export async function logout(): Promise<LogoutResponse> {
  return apiRequest("/auth/logout", logoutResponseSchema, { method: "POST" }, SESSION_ENDPOINT);
}
