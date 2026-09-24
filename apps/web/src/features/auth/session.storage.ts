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

function getStorage(type: "local" | "session"): Storage | null {
  try {
    if (type === "local") {
      if (typeof localStorage !== "undefined") return localStorage;
      if (typeof globalThis.localStorage !== "undefined") return globalThis.localStorage;
    } else {
      if (typeof sessionStorage !== "undefined") return sessionStorage;
      if (typeof globalThis.sessionStorage !== "undefined") return globalThis.sessionStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function saveSession(session: AuthSession): void {
  inMemorySession = session;
  const local = getStorage("local");
  const sess = getStorage("session");

  try {
    const serialized = JSON.stringify(session);
    if (session.rememberMe) {
      local?.setItem(AUTH_SESSION_STORAGE_KEY, serialized);
      sess?.removeItem(AUTH_SESSION_STORAGE_KEY);
    } else {
      sess?.setItem(AUTH_SESSION_STORAGE_KEY, serialized);
      local?.removeItem(AUTH_SESSION_STORAGE_KEY);
    }
  } catch {
    // Storage quota or security restrictions fallback to in-memory
  }
}

export function loadSession(): AuthSession | null {
  if (inMemorySession) return inMemorySession;

  const local = getStorage("local");
  const sess = getStorage("session");

  try {
    const raw = sess?.getItem(AUTH_SESSION_STORAGE_KEY) ?? local?.getItem(AUTH_SESSION_STORAGE_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const validated = authSessionSchema.safeParse(parsed);
    if (validated.success) {
      inMemorySession = validated.data;
      return validated.data;
    }

    clearSession();
    return null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  inMemorySession = null;
  const local = getStorage("local");
  const sess = getStorage("session");

  try {
    sess?.removeItem(AUTH_SESSION_STORAGE_KEY);
    local?.removeItem(AUTH_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage clear errors
  }
}

export function getAuthToken(): string | null {
  const session = inMemorySession ?? loadSession();
  return session ? session.token : null;
}
