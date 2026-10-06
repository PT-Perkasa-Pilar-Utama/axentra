import path from "node:path";
import postgres from "postgres";
import { closeDatabase, createDatabaseClient, runMigrations } from "@axentra/db";
import {
  ALLOWED_LOCAL_TEST_HOSTS,
  assertDisposableTestDatabase,
  isDisposableTestDatabase,
} from "../../test/helpers/disposable-database";

export const DEFAULT_LOCAL_TEST_DB_URL =
  "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";

export function resolveTestDatabaseUrl(providedUrl?: string): string {
  if (providedUrl !== undefined) {
    assertDisposableTestDatabase(providedUrl);
    return providedUrl;
  }
  if (Bun.env.TEST_DATABASE_URL) {
    assertDisposableTestDatabase(Bun.env.TEST_DATABASE_URL);
    return Bun.env.TEST_DATABASE_URL;
  }
  if (Bun.env.DATABASE_URL && isDisposableTestDatabase(Bun.env.DATABASE_URL)) {
    return Bun.env.DATABASE_URL;
  }
  if (Bun.env.DATABASE_URL) {
    try {
      const parsed = new URL(Bun.env.DATABASE_URL);
      const dbName = parsed.pathname.replace(/^\//, "");
      parsed.pathname = `/${dbName}_test`;
      const derived = parsed.toString();
      if (isDisposableTestDatabase(derived)) {
        return derived;
      }
    } catch {
      // fallback to default
    }
  }
  return DEFAULT_LOCAL_TEST_DB_URL;
}

/**
 * Idempotently provisions the disposable test database and applies Drizzle migrations.
 *
 * Works for both fresh and pre-existing persistent local PostgreSQL volumes (Finding F5):
 * 1. Resolves and validates that target database name is explicitly disposable (e.g. axentra_test).
 * 2. Connects to maintenance database ('axentra' or 'postgres').
 * 3. Checks if target database exists; if missing, creates it safely via CREATE DATABASE.
 * 4. Connects to the target test database and runs all pending Drizzle migrations.
 */
export async function ensureTestDatabaseReady(targetUrlInput?: string): Promise<string> {
  const databaseUrl = resolveTestDatabaseUrl(targetUrlInput);
  assertDisposableTestDatabase(databaseUrl);

  const parsed = new URL(databaseUrl);
  const targetDbName = parsed.pathname.replace(/^\//, "");
  if (!targetDbName || !/^[a-zA-Z0-9_]+$/.test(targetDbName)) {
    throw new Error(`[test-db] Invalid target test database name: '${targetDbName}'`);
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!ALLOWED_LOCAL_TEST_HOSTS.has(host)) {
    throw new Error(
      `[test-db] Safety guard violation: Refusing to provision database on unauthorized host '${host}'.`,
    );
  }

  // Connect to maintenance database to inspect and provision the target test database
  const maintenanceCandidates = ["axentra", "postgres"];
  let adminSql: ReturnType<typeof postgres> | undefined;

  for (const maintDb of maintenanceCandidates) {
    try {
      const maintUrl = new URL(databaseUrl);
      maintUrl.pathname = `/${maintDb}`;
      const candidateSql = postgres(maintUrl.toString(), {
        max: 1,
        connect_timeout: 5,
        onnotice: () => undefined,
      });
      await candidateSql`SELECT 1`;
      adminSql = candidateSql;
      break;
    } catch {
      // try next candidate maintenance database
    }
  }

  if (adminSql === undefined) {
    throw new Error(
      `[test-db] Could not connect to PostgreSQL server at ${parsed.host} using maintenance databases ('axentra', 'postgres'). Ensure PostgreSQL container is running.`,
    );
  }

  try {
    const existing = await adminSql`SELECT 1 FROM pg_database WHERE datname = ${targetDbName}`;
    if (existing.length === 0) {
      console.info(
        `[test-db] Database '${targetDbName}' does not exist on existing volume. Creating...`,
      );
      await adminSql.unsafe(`CREATE DATABASE "${targetDbName}"`);
      console.info(`[test-db] Database '${targetDbName}' created successfully.`);
    } else {
      console.info(`[test-db] Database '${targetDbName}' already exists.`);
    }
  } finally {
    await adminSql.end();
  }

  // Apply Drizzle migrations to the target test database
  const client = createDatabaseClient(databaseUrl);
  try {
    const migrationsFolder = path.resolve(import.meta.dir, "../../packages/db/drizzle");
    await runMigrations(client, migrationsFolder);
    console.info(`[test-db] Migrations verified/applied to '${targetDbName}'.`);
  } finally {
    await closeDatabase(client);
  }

  return databaseUrl;
}

if (import.meta.main) {
  try {
    await ensureTestDatabaseReady();
  } catch (error) {
    console.error("[test-db] Failed to prepare test database:", error);
    process.exit(1);
  }
}
