import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { authLoginAttempts } from "@axentra/db";
import {
  emptyLoginAttemptState,
  reserveLoginAttempt,
  type LoginAttemptDecision,
} from "./auth.policy";
import type { LoginAttemptStore } from "./auth.types";

export class DrizzleLoginAttemptStore implements LoginAttemptStore {
  public constructor(private readonly db: PostgresJsDatabase) {}

  public async reserve(emailHash: string, now: Date): Promise<LoginAttemptDecision> {
    return this.db.transaction(async (tx) => {
      // One statement inserts the row or, when it exists, locks it; either way the row comes back and stays
      // locked until commit. Concurrent attempts for one email therefore run one after another, and a row
      // that a concurrent successful login deletes is recreated instead of going missing.
      const rows = await tx
        .insert(authLoginAttempts)
        .values({ emailHash, ...emptyLoginAttemptState(now), createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: authLoginAttempts.emailHash,
          set: { emailHash: sql`excluded.email_hash` },
        })
        .returning({
          failedCount: authLoginAttempts.failedCount,
          windowStartedAt: authLoginAttempts.windowStartedAt,
          lockedUntil: authLoginAttempts.lockedUntil,
        });
      const row = rows[0];
      if (row === undefined) throw new Error("auth_login_attempts upsert returned no row");

      const decision = reserveLoginAttempt(row, now);
      if (decision.allowed) {
        await tx
          .update(authLoginAttempts)
          .set({
            failedCount: decision.state.failedCount,
            windowStartedAt: decision.state.windowStartedAt,
            lockedUntil: decision.state.lockedUntil,
            updatedAt: now,
          })
          .where(eq(authLoginAttempts.emailHash, emailHash));
      }
      return decision;
    });
  }

  public async reset(emailHash: string): Promise<void> {
    await this.db.delete(authLoginAttempts).where(eq(authLoginAttempts.emailHash, emailHash));
  }
}
