import {
  reserveLoginAttempt,
  type LoginAttemptDecision,
  type LoginAttemptState,
} from "./auth.policy";
import { createAuthService, type AuthService, type UserAuthenticator } from "./auth.service";
import type {
  AuthSessionRecord,
  AuthSessionStore,
  CreateAuthSessionInput,
  LoginAttemptStore,
  RefreshTokenMatch,
  RotateAuthSessionInput,
} from "./auth.types";

// Unit-test doubles with the same semantics as the Drizzle stores. Production wiring never uses them.

type StoredSession = AuthSessionRecord & {
  accessTokenHash: string;
  refreshTokenHash: string;
};

function toRecord(stored: StoredSession): AuthSessionRecord {
  return {
    id: stored.id,
    user: stored.user,
    rememberMe: stored.rememberMe,
    createdAt: stored.createdAt,
    accessExpiresAt: stored.accessExpiresAt,
    refreshExpiresAt: stored.refreshExpiresAt,
    revokedAt: stored.revokedAt,
  };
}

export class InMemoryAuthSessionStore implements AuthSessionStore {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly rotatedRefreshTokens = new Map<string, string>();

  public async createSession(input: CreateAuthSessionInput): Promise<AuthSessionRecord> {
    const stored: StoredSession = {
      id: input.id,
      user: input.user,
      rememberMe: input.rememberMe,
      createdAt: input.now,
      accessExpiresAt: input.accessExpiresAt,
      refreshExpiresAt: input.refreshExpiresAt,
      revokedAt: null,
      accessTokenHash: input.accessTokenHash,
      refreshTokenHash: input.refreshTokenHash,
    };
    this.sessions.set(stored.id, stored);
    return toRecord(stored);
  }

  public async findByAccessTokenHash(accessTokenHash: string): Promise<AuthSessionRecord | null> {
    const stored = [...this.sessions.values()].find((s) => s.accessTokenHash === accessTokenHash);
    return stored === undefined ? null : toRecord(stored);
  }

  public async findByRefreshTokenHash(refreshTokenHash: string): Promise<RefreshTokenMatch | null> {
    const current = [...this.sessions.values()].find(
      (s) => s.refreshTokenHash === refreshTokenHash,
    );
    if (current !== undefined) return { session: toRecord(current), current: true };

    const sessionId = this.rotatedRefreshTokens.get(refreshTokenHash);
    const session = sessionId === undefined ? undefined : this.sessions.get(sessionId);
    return session === undefined ? null : { session: toRecord(session), current: false };
  }

  public async rotateSession(input: RotateAuthSessionInput): Promise<boolean> {
    const session = this.sessions.get(input.sessionId);
    if (
      session === undefined ||
      session.revokedAt !== null ||
      session.refreshTokenHash !== input.presentedRefreshTokenHash
    ) {
      return false;
    }
    this.rotatedRefreshTokens.set(input.presentedRefreshTokenHash, session.id);
    session.accessTokenHash = input.accessTokenHash;
    session.refreshTokenHash = input.refreshTokenHash;
    session.accessExpiresAt = input.accessExpiresAt;
    session.refreshExpiresAt = input.refreshExpiresAt;
    return true;
  }

  public async revokeSession(sessionId: string, revokedAt: Date): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session !== undefined && session.revokedAt === null) session.revokedAt = revokedAt;
  }
}

export class InMemoryLoginAttemptStore implements LoginAttemptStore {
  private readonly states = new Map<string, LoginAttemptState>();

  public async reserve(emailHash: string, now: Date): Promise<LoginAttemptDecision> {
    const decision = reserveLoginAttempt(this.states.get(emailHash) ?? null, now);
    if (decision.allowed) this.states.set(emailHash, decision.state);
    return decision;
  }

  public async reset(emailHash: string): Promise<void> {
    this.states.delete(emailHash);
  }
}

// Test-only wiring: production code always injects the Drizzle stores explicitly.
export function createInMemoryAuthService(options: {
  authenticator: UserAuthenticator;
  clock?: (() => Date) | undefined;
}): AuthService {
  return createAuthService({
    authenticator: options.authenticator,
    clock: options.clock,
    sessionStore: new InMemoryAuthSessionStore(),
    loginAttemptStore: new InMemoryLoginAttemptStore(),
  });
}
