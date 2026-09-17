import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

export type DatabaseClient = {
  db: PostgresJsDatabase;
  sql: Sql;
};

export function createDatabaseClient(databaseUrl: string): DatabaseClient {
  const sql = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 5,
    prepare: false,
  });
  return { db: drizzle(sql), sql };
}

export async function checkDatabase(client: DatabaseClient): Promise<void> {
  await client.sql`select 1 as healthy`;
}

export async function closeDatabase(client: DatabaseClient): Promise<void> {
  await client.sql.end({ timeout: 5 });
}
