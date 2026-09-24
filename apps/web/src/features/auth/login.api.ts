import type { LoginRequest, LoginResponse } from "@axentra/shared";
import { loginResponseSchema } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  return apiRequest("/auth/login", loginResponseSchema, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
