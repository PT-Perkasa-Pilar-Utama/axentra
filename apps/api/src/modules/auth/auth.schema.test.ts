import { describe, expect, it } from "bun:test";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { authLoginAttempts, authRotatedRefreshTokens, authSessions } from "@axentra/db";

// The auth repositories rely on these keys: token and email hashes are looked up through unique indexes,
// and the login-attempt upsert uses the email_hash unique index as its conflict target.

function primaryKeyColumnNames(table: PgTable): string[] {
  return Object.values(getTableColumns(table))
    .filter((column) => column.primary)
    .map((column) => column.name);
}

function indexColumnNames(table: PgTable, indexName: string): string[] | undefined {
  const found = getTableConfig(table).indexes.find((index) => index.config.name === indexName);
  if (found === undefined || found.config.unique !== true) return undefined;
  return found.config.columns.map((column) => ("name" in column ? String(column.name) : "sql"));
}

function foreignKeyTargets(table: PgTable): string[] {
  return getTableConfig(table).foreignKeys.map((foreignKey) => {
    const reference = foreignKey.reference();
    const columns = reference.columns.map((column) => column.name).join(",");
    const target = getTableConfig(reference.foreignTable).name;
    const targetColumns = reference.foreignColumns.map((column) => column.name).join(",");
    return `${columns} -> ${target}.${targetColumns} on delete ${foreignKey.onDelete ?? "no action"}`;
  });
}

describe("auth table keys (F5)", () => {
  it.each([
    ["auth_sessions", authSessions],
    ["auth_rotated_refresh_tokens", authRotatedRefreshTokens],
    ["auth_login_attempts", authLoginAttempts],
  ] as const)("%s has a UUID id primary key with a database default", (_name, table) => {
    const { id } = getTableColumns(table);

    expect(primaryKeyColumnNames(table)).toEqual(["id"]);
    expect(getTableConfig(table).primaryKeys).toEqual([]);
    expect(id.getSQLType()).toBe("uuid");
    expect(id.hasDefault).toBe(true);
  });

  it.each([
    ["auth_sessions_access_token_hash_unique_idx", authSessions, "access_token_hash"],
    ["auth_sessions_refresh_token_hash_unique_idx", authSessions, "refresh_token_hash"],
    ["auth_rotated_refresh_tokens_token_hash_unique_idx", authRotatedRefreshTokens, "token_hash"],
    ["auth_login_attempts_email_hash_unique_idx", authLoginAttempts, "email_hash"],
  ] as const)("keeps the hash unique through %s", (indexName, table, columnName) => {
    const hashColumn = Object.values(getTableColumns(table)).find(
      (column) => column.name === columnName,
    );

    expect(indexColumnNames(table, indexName)).toEqual([columnName]);
    expect(hashColumn?.notNull).toBe(true);
    expect(hashColumn?.primary).toBe(false);
  });

  it.each([
    ["auth_sessions", authSessions],
    ["auth_login_attempts", authLoginAttempts],
  ] as const)("%s records created_at and updated_at", (_name, table) => {
    const { createdAt, updatedAt } = getTableColumns(table);

    expect([createdAt.name, updatedAt.name]).toEqual(["created_at", "updated_at"]);
    for (const column of [createdAt, updatedAt]) {
      expect(column.notNull).toBe(true);
      expect(column.hasDefault).toBe(true);
    }
  });

  it("keeps the cascading foreign keys from sessions to users and from rotated tokens to sessions", () => {
    expect(foreignKeyTargets(authSessions)).toEqual(["user_id -> users.id on delete cascade"]);
    expect(foreignKeyTargets(authRotatedRefreshTokens)).toEqual([
      "session_id -> auth_sessions.id on delete cascade",
    ]);
    expect(foreignKeyTargets(authLoginAttempts)).toEqual([]);
  });
});
