import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { authLoginAttempts } from "@axentra/db";
import { reserveLoginAttempt, type LoginAttemptDecision } from "./auth.policy";
import type { LoginAttemptStore } from "./auth.types";

export class DrizzleLoginAttemptStore implements LoginAttemptStore {
  public constructor(private readonly db: PostgresJsDatabase) {}

  public async reserve(emailHash: string, now: Date): Promise<LoginAttemptDecision> {
    // The row lock taken below serializes concurrent attempts for the same email.
    return this.db.transaction(async (tx) => {
      await tx
        .insert(authLoginAttempts)
        .values({ emailHash, failedCount: 0, windowStartedAt: now, lockedUntil: null })
        .onConflictDoNothing({ target: authLoginAttempts.emailHash });

      const rows = await tx
        .select({
          failedCount: authLoginAttempts.failedCount,
          windowStartedAt: authLoginAttempts.windowStartedAt,
          lockedUntil: authLoginAttempts.lockedUntil,
        })
        .from(authLoginAttempts)
        .where(eq(authLoginAttempts.emailHash, emailHash))
        .for("update")
        .limit(1);
      const row = rows[0];
      if (row === undefined) throw new Error("auth_login_attempts row is missing after upsert");

      const decision = reserveLoginAttempt(row, now);
      if (decision.allowed) {
        await tx
          .update(authLoginAttempts)
          .set({
            failedCount: decision.state.failedCount,
            windowStartedAt: decision.state.windowStartedAt,
            lockedUntil: decision.state.lockedUntil,
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
