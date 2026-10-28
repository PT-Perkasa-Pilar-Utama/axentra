import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { authRotatedRefreshTokens, authSessions, users } from "@axentra/db";
import type { AuthUser, UserRole } from "@axentra/shared";
import type {
  AuthSessionRecord,
  AuthSessionStore,
  CreateAuthSessionInput,
  RefreshTokenMatch,
  RotateAuthSessionInput,
} from "./auth.types";

type SessionRow = {
  id: string;
  rememberMe: boolean;
  createdAt: Date;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  revokedAt: Date | null;
  userId: string;
  userEmail: string;
  userName: string | null;
  userRole: UserRole;
};

const sessionColumns = {
  id: authSessions.id,
  rememberMe: authSessions.rememberMe,
  createdAt: authSessions.createdAt,
  accessExpiresAt: authSessions.accessExpiresAt,
  refreshExpiresAt: authSessions.refreshExpiresAt,
  revokedAt: authSessions.revokedAt,
  userId: users.id,
  userEmail: users.email,
  userName: users.name,
  userRole: users.role,
};

function toSessionRecord(row: SessionRow): AuthSessionRecord {
  const user: AuthUser = {
    id: row.userId,
    email: row.userEmail,
    role: row.userRole,
    ...(row.userName === null ? {} : { name: row.userName }),
  };
  return {
    id: row.id,
    user,
    rememberMe: row.rememberMe,
    createdAt: row.createdAt,
    accessExpiresAt: row.accessExpiresAt,
    refreshExpiresAt: row.refreshExpiresAt,
    revokedAt: row.revokedAt,
  };
}

export class DrizzleAuthSessionStore implements AuthSessionStore {
  public constructor(private readonly db: PostgresJsDatabase) {}

  public async createSession(input: CreateAuthSessionInput): Promise<AuthSessionRecord> {
    await this.db.insert(authSessions).values({
      id: input.id,
      userId: input.user.id,
      rememberMe: input.rememberMe,
      accessTokenHash: input.accessTokenHash,
      refreshTokenHash: input.refreshTokenHash,
      accessExpiresAt: input.accessExpiresAt,
      refreshExpiresAt: input.refreshExpiresAt,
      lastUsedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    });
    return {
      id: input.id,
      user: input.user,
      rememberMe: input.rememberMe,
      createdAt: input.now,
      accessExpiresAt: input.accessExpiresAt,
      refreshExpiresAt: input.refreshExpiresAt,
      revokedAt: null,
    };
  }

  public async findByAccessTokenHash(accessTokenHash: string): Promise<AuthSessionRecord | null> {
    return this.findOne(eq(authSessions.accessTokenHash, accessTokenHash));
  }

  public async findByRefreshTokenHash(refreshTokenHash: string): Promise<RefreshTokenMatch | null> {
    const current = await this.findOne(eq(authSessions.refreshTokenHash, refreshTokenHash));
    if (current !== null) return { session: current, current: true };

    const rotated = await this.db
      .select({ sessionId: authRotatedRefreshTokens.sessionId })
      .from(authRotatedRefreshTokens)
      .where(eq(authRotatedRefreshTokens.tokenHash, refreshTokenHash))
      .limit(1);
    const sessionId = rotated[0]?.sessionId;
    if (sessionId === undefined) return null;

    const session = await this.findOne(eq(authSessions.id, sessionId));
    return session === null ? null : { session, current: false };
  }

  public async rotateSession(input: RotateAuthSessionInput): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(authSessions)
        .set({
          accessTokenHash: input.accessTokenHash,
          refreshTokenHash: input.refreshTokenHash,
          accessExpiresAt: input.accessExpiresAt,
          refreshExpiresAt: input.refreshExpiresAt,
          lastUsedAt: input.now,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(authSessions.id, input.sessionId),
            eq(authSessions.refreshTokenHash, input.presentedRefreshTokenHash),
            isNull(authSessions.revokedAt),
          ),
        )
        .returning({ id: authSessions.id });
      if (updated.length === 0) return false;

      await tx.insert(authRotatedRefreshTokens).values({
        tokenHash: input.presentedRefreshTokenHash,
        sessionId: input.sessionId,
        rotatedAt: input.now,
      });
      return true;
    });
  }

  public async revokeSession(sessionId: string, revokedAt: Date): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ revokedAt, updatedAt: revokedAt })
      .where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)));
  }

  // The condition is required: Drizzle treats an undefined where clause as "no filter", which would return any session.
  private async findOne(condition: SQL): Promise<AuthSessionRecord | null> {
    const rows = await this.db
      .select(sessionColumns)
      .from(authSessions)
      .innerJoin(users, eq(users.id, authSessions.userId))
      .where(condition)
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toSessionRecord(row);
  }
}
