import type { AuthUser } from "@axentra/shared";
import type { LoginAttemptDecision } from "./auth.policy";

export type AuthSessionRecord = {
  id: string;
  user: AuthUser;
  rememberMe: boolean;
  createdAt: Date;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  revokedAt: Date | null;
};

export type CreateAuthSessionInput = {
  id: string;
  user: AuthUser;
  rememberMe: boolean;
  accessTokenHash: string;
  refreshTokenHash: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  now: Date;
};

export type RefreshTokenMatch = {
  session: AuthSessionRecord;
  // false when the presented refresh token was already rotated away from its session (reuse).
  current: boolean;
};

export type RotateAuthSessionInput = {
  sessionId: string;
  presentedRefreshTokenHash: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  now: Date;
};

export type AuthSessionStore = {
  createSession(input: CreateAuthSessionInput): Promise<AuthSessionRecord>;
  findByAccessTokenHash(accessTokenHash: string): Promise<AuthSessionRecord | null>;
  findByRefreshTokenHash(refreshTokenHash: string): Promise<RefreshTokenMatch | null>;
  // Compare-and-swap: succeeds only while the presented refresh token is still the session's current one
  // and the session is not revoked.
  rotateSession(input: RotateAuthSessionInput): Promise<boolean>;
  revokeSession(sessionId: string, revokedAt: Date): Promise<void>;
};

export type LoginAttemptStore = {
  // Atomically records one attempt for the email hash and reports whether it may be checked.
  reserve(emailHash: string, now: Date): Promise<LoginAttemptDecision>;
  reset(emailHash: string): Promise<void>;
};

export type AuthCredentials = {
  user: AuthUser;
  passwordHash: string;
};

export type AuthUserRepository = {
  findCredentialsByEmail(email: string): Promise<AuthCredentials | null>;
};
