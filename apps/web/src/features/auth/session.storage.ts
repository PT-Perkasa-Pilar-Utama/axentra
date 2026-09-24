import { authUserSchema } from "@axentra/shared";
import { z } from "zod";

export const authSessionSchema = z.object({
  user: authUserSchema,
  token: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  rememberMe: z.boolean(),
});

export type AuthSession = z.infer<typeof authSessionSchema>;

export const AUTH_SESSION_STORAGE_KEY = "axentra_auth_session";

let inMemorySession: AuthSession | null = null;

function purgeWebStorage(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction
  }

  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction
  }
}

export function saveSession(session: AuthSession): void {
  // Sensitive bearer and refresh tokens MUST remain in memory only per security specs
  // (docs/technical-specs/09-authentication.md & docs/api-specs/02-authentication.md).
  inMemorySession = session;
  purgeWebStorage();
}

export function loadSession(): AuthSession | null {
  return inMemorySession;
}

export function clearSession(): void {
  inMemorySession = null;
  purgeWebStorage();
}

export function getAuthToken(): string | null {
  return inMemorySession ? inMemorySession.token : null;
}
