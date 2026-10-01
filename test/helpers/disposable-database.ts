import type { DatabaseClient } from "@axentra/db";

/**
 * Helper to validate that a database URL and environment represent an explicitly
 * isolated, disposable test database before allowing integration test cleanup.
 *
 * Prevents accidental data deletion on shared or persistent local development databases.
 */
export function isDisposableTestDatabase(
  databaseUrl: string,
  env: Record<string, string | undefined> = Bun.env,
): boolean {
  try {
    const parsed = new URL(databaseUrl);
    const host = parsed.hostname;
    const isLocalHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "postgres" ||
      host.endsWith(".local");

    // Remote or non-local hosts are never considered disposable
    if (!isLocalHost) {
      return false;
    }

    const dbName = parsed.pathname.replace(/^\//, "");
    const lowerDbName = dbName.toLowerCase();

    // Production-named databases are strictly forbidden under any circumstances
    if (lowerDbName.includes("prod") || lowerDbName === "production") {
      return false;
    }

    // 1. Explicit test database naming (e.g. axentra_test, test, dms_disposable)
    const isExplicitTestDbName =
      dbName === "test" ||
      dbName.endsWith("_test") ||
      dbName.endsWith("_disposable") ||
      dbName === "axentra_test";

    if (isExplicitTestDbName) {
      return true;
    }

    // 2. Explicit opt-in environment flag authorizing disposable test cleanup
    const hasExplicitDisposableFlag =
      env.AXENTRA_DISPOSABLE_TEST_DB === "1" ||
      env.AXENTRA_DISPOSABLE_TEST_DB === "true" ||
      env.ALLOW_DISPOSABLE_DB_CLEANUP === "true" ||
      env.ALLOW_DISPOSABLE_DB_CLEANUP === "1";

    if (hasExplicitDisposableFlag) {
      return true;
    }

    // 3. Isolated CI container execution
    const isCiTestEnv = env.CI === "true" && env.APP_ENV === "test";
    return isCiTestEnv;
  } catch {
    return false;
  }
}

export function assertDisposableTestDatabase(
  databaseUrl: string,
  env: Record<string, string | undefined> = Bun.env,
): void {
  if (!isDisposableTestDatabase(databaseUrl, env)) {
    throw new Error(
      `Safety guard violation: Database '${databaseUrl}' is not an explicitly validated disposable test database. ` +
        `Integration test cleanup is refused to prevent data loss on shared or persistent local development databases. ` +
        `To run tests against a disposable database, use a database named '*_test', set AXENTRA_DISPOSABLE_TEST_DB=1, ` +
        `or run in a CI test environment.`,
    );
  }
}

export type SafeCleanupOptions = {
  preExistingCategoryIds?: Set<string>;
  databaseUrl?: string;
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
 * 1. Validates disposable database guard.
 * 2. Deduplicates candidate category IDs actually inserted by the test worker.
 * 3. Excludes pre-existing category IDs captured at suite setup.
 * 4. Referential integrity guard: Verifies NO remaining documents in the database
 *    reference the category. If another document references it, deletion is skipped.
 * 5. Deletes strictly by exact ID (never by name or slug).
 */
export async function safeCleanupTestCategories(
  database: DatabaseClient,
  candidateCategoryIds: string[],
  options: SafeCleanupOptions = {},
): Promise<SafeCleanupResult> {
  if (options.databaseUrl) {
    assertDisposableTestDatabase(options.databaseUrl, options.env);
  }

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
    await database.db
      .delete(categoryDownloadPermissions)
      .where(inArray(categoryDownloadPermissions.categoryId, safeToDeleteIds));
    await database.db.delete(categories).where(inArray(categories.id, safeToDeleteIds));
    result.deletedCategoryIds.push(...safeToDeleteIds);
  }

  return result;
}
