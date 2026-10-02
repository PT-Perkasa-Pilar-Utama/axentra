import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

export type DatabaseClient = {
  db: PostgresJsDatabase;
  sql: Sql;
};

type VerifiedDatabaseConnection = Readonly<{
  sql: Sql;
  hosts: readonly string[];
}>;

const verifiedDatabaseConnections = new WeakMap<object, VerifiedDatabaseConnection>();

export function getVerifiedDatabaseConnection(db: unknown): VerifiedDatabaseConnection | undefined {
  if (db === null || typeof db !== "object") {
    return undefined;
  }

  return verifiedDatabaseConnections.get(db);
}

export function createDatabaseClient(databaseUrl: string): DatabaseClient {
  const sql = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 5,
    prepare: false,
  });
  const db = drizzle(sql);
  const options = sql.options;
  const configuredHosts = options.host;
  const hosts = Object.freeze(configuredHosts.map((host) => host.toLowerCase()));
  Object.freeze(configuredHosts);
  Object.defineProperty(options, "host", {
    configurable: false,
    enumerable: true,
    value: configuredHosts,
    writable: false,
  });
  Object.defineProperty(sql, "options", {
    configurable: false,
    enumerable: true,
    value: options,
    writable: false,
  });
  verifiedDatabaseConnections.set(db, Object.freeze({ sql, hosts }));

  return { db, sql };
}

export async function checkDatabase(client: DatabaseClient): Promise<void> {
  await client.sql`select 1 as healthy`;
}

export async function closeDatabase(client: DatabaseClient): Promise<void> {
  await client.sql.end({ timeout: 5 });
}
