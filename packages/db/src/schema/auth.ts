import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// Stores SHA-256 hashes of session tokens only. Raw access and refresh tokens are never persisted.
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessTokenHash: text("access_token_hash").notNull(),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    rememberMe: boolean("remember_me").default(false).notNull(),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true, mode: "date" }).notNull(),
    refreshExpiresAt: timestamp("refresh_expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("auth_sessions_access_token_hash_unique_idx").on(table.accessTokenHash),
    uniqueIndex("auth_sessions_refresh_token_hash_unique_idx").on(table.refreshTokenHash),
    index("auth_sessions_user_id_idx").on(table.userId),
  ],
);

// Hashes of refresh tokens that were rotated away from a session. Presenting one of them again is reuse.
export const authRotatedRefreshTokens = pgTable(
  "auth_rotated_refresh_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => authSessions.id, { onDelete: "cascade" }),
    rotatedAt: timestamp("rotated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("auth_rotated_refresh_tokens_session_id_idx").on(table.sessionId)],
);

// One row per SHA-256 hash of a normalized login email. Deleted when a login succeeds.
export const authLoginAttempts = pgTable("auth_login_attempts", {
  emailHash: text("email_hash").primaryKey(),
  failedCount: integer("failed_count").notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true, mode: "date" }).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "date" }),
});
