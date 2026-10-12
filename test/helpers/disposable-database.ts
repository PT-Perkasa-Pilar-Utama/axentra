import type { DatabaseClient } from "@axentra/db";
import { getVerifiedDatabaseConnection } from "@axentra/db";

export const ALLOWED_LOCAL_TEST_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "host.docker.internal",
  "postgres",
]);

/**
 * Strips username and password credentials from a database URL for safe error messages and logging (Finding F22).
 *
 * Example:
 * 'postgres://axentra:local-postgres-password@localhost:5432/axentra_test'
 * -> 'postgres://localhost:5432/axentra_test'
 */
export function sanitizeDatabaseUrl(databaseUrl: string): string {
  if (typeof databaseUrl !== "string" || databaseUrl.trim().length === 0) {
    return "<empty-url>";
  }
  try {
    const parsed = new URL(databaseUrl);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return sanitizeCredentials(databaseUrl);
  }
}

/**
 * Redacts database credentials (username and password) embedded in any connection URL or log string (Finding F22).
 */
export function sanitizeCredentials(text: string): string {
  if (typeof text !== "string") {
    return "";
  }
  return text.replace(
    /((?:postgres|postgresql):\/\/)[^/@\s:]+(:[^/@\s]*)?@/gi,
    (_match, proto) => proto,
  );
}

/**
 * Returns a safe, human-readable reason why a database URL was rejected by the disposable database guard,
 * without exposing sensitive credentials (Finding F22).
 */
export function getDisposableDatabaseRejectionReason(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);

    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      return `unsupported protocol '${parsed.protocol}' (must be postgres: or postgresql:)`;
    }

    if (parsed.searchParams.has("host")) {
      return "host query parameter is forbidden";
    }

    const rawHost = parsed.hostname.toLowerCase();
    const normalizedHost = rawHost.replace(/^\[|\]$/g, "");
    if (!ALLOWED_LOCAL_TEST_HOSTS.has(normalizedHost)) {
      return `host '${normalizedHost}' is not in allowed local test hosts (${Array.from(ALLOWED_LOCAL_TEST_HOSTS).join(", ")})`;
    }

    const dbName = parsed.pathname.replace(/^\//, "");
    const lowerDbName = dbName.toLowerCase();

    if (lowerDbName.includes("prod") || lowerDbName === "production") {
      return `database name '${dbName}' indicates a production database`;
    }

    if (
      lowerDbName === "axentra" ||
      lowerDbName === "axentra_dev" ||
      lowerDbName === "development" ||
      lowerDbName === "dev"
    ) {
      return `database name '${dbName}' is a persistent development database`;
    }

    const isExplicitTestDbName =
      dbName === "test" ||
      dbName.endsWith("_test") ||
      dbName.endsWith("_disposable") ||
      dbName.startsWith("test_");

    if (!isExplicitTestDbName) {
      return `database name '${dbName}' does not have an explicit test suffix or prefix (*_test, *_disposable, test_*)`;
    }

    return "unknown validation failure";
  } catch {
    return "malformed database URL";
  }
}

/**
 * Helper to validate that a database URL and environment represent an explicitly
 * isolated, disposable test database before allowing integration test cleanup.
 *
 * Prevents accidental data deletion on shared or persistent local development databases.
 */
export function isDisposableTestDatabase(
  databaseUrl: string,
  _env: Record<string, string | undefined> = Bun.env,
): boolean {
  try {
    const parsed = new URL(databaseUrl);

    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      return false;
    }

    if (parsed.searchParams.has("host")) {
      return false;
    }

    const rawHost = parsed.hostname.toLowerCase();
    const normalizedHost = rawHost.replace(/^\[|\]$/g, "");
    const isLocalHost = ALLOWED_LOCAL_TEST_HOSTS.has(normalizedHost);

    // Remote, internal network, or arbitrary non-local hosts (including *.local) are never disposable (Finding F7)
    if (!isLocalHost) {
      return false;
    }

    const dbName = parsed.pathname.replace(/^\//, "");
    const lowerDbName = dbName.toLowerCase();

    // Production-named databases are strictly forbidden under any circumstances
    if (lowerDbName.includes("prod") || lowerDbName === "production") {
      return false;
    }

    // Persistent development databases (e.g. 'axentra' from infra/local/docker-compose.yml,
    // 'development', 'axentra_dev') are NEVER considered disposable, even under generic CI or test flags (Finding F1 / Round 4).
    if (
      lowerDbName === "axentra" ||
      lowerDbName === "axentra_dev" ||
      lowerDbName === "development" ||
      lowerDbName === "dev"
    ) {
      return false;
    }

    // Explicit test database naming required (e.g. axentra_test, test, dms_disposable)
    const isExplicitTestDbName =
      dbName === "test" ||
      dbName.endsWith("_test") ||
      dbName.endsWith("_disposable") ||
      dbName.startsWith("test_");

    return isExplicitTestDbName;
  } catch {
    return false;
  }
}

export function assertDisposableTestDatabase(
  databaseUrl: string,
  env: Record<string, string | undefined> = Bun.env,
): void {
  if (!isDisposableTestDatabase(databaseUrl, env)) {
    const sanitizedUrl = sanitizeDatabaseUrl(databaseUrl);
    const reason = getDisposableDatabaseRejectionReason(databaseUrl);
    throw new Error(
      `Safety guard violation: Database '${sanitizedUrl}' is not an explicitly validated disposable test database (reason: ${reason}). ` +
        `Integration test cleanup is refused to prevent data loss on shared or persistent local development databases. ` +
        `To run tests against a disposable database, use a dedicated test database (e.g. '*_test', 'axentra_test', 'test').`,
    );
  }
}

/**
 * Validates that the provided DatabaseClient instance is verified and strictly connected to the
 * same disposable test database and host that passed disposable validation (Finding F21).
 *
 * Rejects any client that targets a different database (e.g. persistent 'axentra') or remote host
 * BEFORE ANY QUERY OR WRITE IS EXECUTED.
 */
export function assertClientConnectedToDisposableDatabase(
  database: DatabaseClient,
  validatedDisposableUrl: string,
): void {
  if (
    !database ||
    typeof database !== "object" ||
    !("sql" in database) ||
    !database.sql ||
    !("db" in database) ||
    !database.db
  ) {
    throw new Error(
      "Safety guard violation: Database client must be a valid DatabaseClient instance with active connection. Cleanup refused before any query or write.",
    );
  }

  const sqlCandidate = database.sql as {
    options?: {
      database?: string;
      host?: string | string[];
      port?: number | number[];
    };
  };

  if (!sqlCandidate.options || typeof sqlCandidate.options !== "object") {
    throw new Error(
      "Safety guard violation: Database client connection options could not be verified. Cleanup refused before any query or write.",
    );
  }

  const parsedUrl = new URL(validatedDisposableUrl);
  const expectedDbName = parsedUrl.pathname.replace(/^\//, "");
  const expectedHost = parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  const clientDb = sqlCandidate.options.database;
  if (typeof clientDb !== "string" || clientDb.trim().length === 0) {
    throw new Error(
      "Safety guard violation: Database client does not specify a target database name. Cleanup refused before any query or write.",
    );
  }

  // 1. Verify client target database matches the validated disposable URL database name
  if (clientDb.toLowerCase() !== expectedDbName.toLowerCase()) {
    throw new Error(
      `Safety guard violation: Database client target mismatch. ` +
        `The client is connected to database '${clientDb}', but the validated disposable URL targets '${expectedDbName}'. ` +
        `Cleanup refused before any query or write.`,
    );
  }

  // 2. Verify client target database is itself a valid disposable test database name
  const lowerClientDb = clientDb.toLowerCase();
  if (
    lowerClientDb.includes("prod") ||
    lowerClientDb === "production" ||
    lowerClientDb === "axentra" ||
    lowerClientDb === "axentra_dev" ||
    lowerClientDb === "development" ||
    lowerClientDb === "dev"
  ) {
    throw new Error(
      `Safety guard violation: Database client is connected to persistent/production database '${clientDb}'. ` +
        `Cleanup refused before any query or write.`,
    );
  }

  // 3. Verify client target hosts match
  const rawClientHost = sqlCandidate.options.host;
  const clientHosts = (Array.isArray(rawClientHost) ? rawClientHost : [rawClientHost])
    .filter((h): h is string => typeof h === "string")
    .map((h) => h.toLowerCase().replace(/^\[|\]$/g, ""));

  if (clientHosts.length === 0) {
    throw new Error(
      "Safety guard violation: Database client does not specify a target host. Cleanup refused before any query or write.",
    );
  }

  if (!clientHosts.includes(expectedHost)) {
    throw new Error(
      `Safety guard violation: Database client host mismatch. ` +
        `The client is connected to host(s) [${clientHosts.join(", ")}], but the validated disposable URL targets host '${expectedHost}'. ` +
        `Cleanup refused before any query or write.`,
    );
  }

  for (const host of clientHosts) {
    if (!ALLOWED_LOCAL_TEST_HOSTS.has(host)) {
      throw new Error(
        `Safety guard violation: Database client host '${host}' is not in allowed local test hosts. ` +
          `Cleanup refused before any query or write.`,
      );
    }
  }

  // 4. Verify weak-map connection integrity if client was created by createDatabaseClient
  const verifiedConn = getVerifiedDatabaseConnection(database.db);
  if (verifiedConn && verifiedConn.sql !== database.sql) {
    throw new Error(
      "Safety guard violation: Database client connection instance mismatch. Cleanup refused before any query or write.",
    );
  }
}

export type SafeCleanupOptions = {
  databaseUrl: string;
  preExistingCategoryIds?: Set<string>;
  env?: Record<string, string | undefined>;
};

export type SafeCleanupResult = {
  deletedCategoryIds: string[];
  skippedCategoryIds: string[];
};

/**
 * Multi-layer safe category cleanup helper.
 *
 * Guarantees that cleanup NEVER deletes categories that do not belong to the test:
 * 1. Fail-closed disposable database validation: Requires a verified disposable databaseUrl.
 * 2. Client connection binding guard (Finding F21): Verifies the database client is connected to
 *    the validated disposable target BEFORE ANY QUERY OR WRITE.
 * 3. Deduplicates candidate category IDs actually inserted by the test worker.
 * 4. Excludes pre-existing category IDs captured at suite setup.
 * 5. Referential integrity guard: Verifies NO remaining documents in the database
 *    reference the category. If another document references it, deletion is skipped.
 * 6. Deletes strictly by exact ID (never by name or slug).
 * 7. Atomic multi-table deletion (Finding F23): Deletes permissions and categories in a single
 *    database transaction to prevent partial state on failure.
 */
export async function safeCleanupTestCategories(
  database: DatabaseClient,
  candidateCategoryIds: string[],
  options: SafeCleanupOptions,
): Promise<SafeCleanupResult> {
  // Fail-closed requirement (Finding F1 / Round 3):
  // Helper MUST always fail closed if target database is not explicitly validated as disposable.
  if (
    !options ||
    typeof options.databaseUrl !== "string" ||
    options.databaseUrl.trim().length === 0
  ) {
    throw new Error(
      "Safety guard violation: safeCleanupTestCategories requires an explicit databaseUrl to validate disposable status before executing cleanup.",
    );
  }

  assertDisposableTestDatabase(options.databaseUrl, options.env);
  assertClientConnectedToDisposableDatabase(database, options.databaseUrl);

  const result: SafeCleanupResult = {
    deletedCategoryIds: [],
    skippedCategoryIds: [],
  };

  if (!candidateCategoryIds || candidateCategoryIds.length === 0) {
    return result;
  }

  const { categories, categoryDownloadPermissions, documents } = await import("@axentra/db");
  const { eq, inArray } = await import("drizzle-orm");

  const uniqueCandidateIds = Array.from(new Set(candidateCategoryIds)).filter(
    (id) => typeof id === "string" && id.trim().length > 0,
  );

  const safeToDeleteIds: string[] = [];

  for (const catId of uniqueCandidateIds) {
    // Layer 1: Skip if category existed before the test started
    if (options.preExistingCategoryIds?.has(catId)) {
      result.skippedCategoryIds.push(catId);
      continue;
    }

    // Layer 2: Skip if any document in the database still references this category
    const [referencingDoc] = await database.db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.categoryId, catId))
      .limit(1);

    if (referencingDoc) {
      result.skippedCategoryIds.push(catId);
      continue;
    }

    safeToDeleteIds.push(catId);
  }

  if (safeToDeleteIds.length > 0) {
    // Atomic multi-table deletion in a single database transaction (Finding F23)
    await database.db.transaction(async (tx) => {
      await tx
        .delete(categoryDownloadPermissions)
        .where(inArray(categoryDownloadPermissions.categoryId, safeToDeleteIds));
      await tx.delete(categories).where(inArray(categories.id, safeToDeleteIds));
    });
    result.deletedCategoryIds.push(...safeToDeleteIds);
  }

  return result;
}
