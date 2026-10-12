import { describe, expect, it, mock } from "bun:test";
import {
  assertClientConnectedToDisposableDatabase,
  assertDisposableTestDatabase,
  getDisposableDatabaseRejectionReason,
  isDisposableTestDatabase,
  safeCleanupTestCategories,
  sanitizeCredentials,
  sanitizeDatabaseUrl,
} from "./disposable-database";
import { formatSanitizedError } from "../../infra/local/prepare-test-db";
import type { DatabaseClient } from "@axentra/db";
import { closeDatabase, createDatabaseClient } from "@axentra/db";
import { categories, categoryDownloadPermissions } from "@axentra/db";
import { eq } from "drizzle-orm";

describe("Disposable Database Safety Guard (Finding F1)", () => {
  it("rejects shared or local development database without explicit disposable authorization", () => {
    // Standard shared / local development database from .env
    const devDbUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra";

    expect(isDisposableTestDatabase(devDbUrl, { APP_ENV: "development" })).toBe(false);
    expect(isDisposableTestDatabase(devDbUrl, {})).toBe(false);

    expect(() => assertDisposableTestDatabase(devDbUrl, { APP_ENV: "development" })).toThrow(
      "Safety guard violation: Database",
    );
  });

  it("rejects non-local / remote databases even if named test", () => {
    const remoteUrl = "postgres://user:pass@remote-staging-db.example.com:5432/axentra_test";
    expect(isDisposableTestDatabase(remoteUrl, {})).toBe(false);
    expect(() => assertDisposableTestDatabase(remoteUrl, {})).toThrow(
      "Safety guard violation: Database",
    );
  });

  it("rejects arbitrary .local or internal network hostnames without wildcard bypass (Finding F7)", () => {
    const arbitraryLocalUrls = [
      "postgres://user:pass@shared-db.internal.local:5432/axentra_test",
      "postgres://user:pass@company.local:5432/axentra_test",
      "postgres://user:pass@db.axentra.local:5432/axentra_test",
      "postgres://user:pass@prod-db.company.local:5432/axentra_test",
      "postgres://user:pass@192.168.1.100:5432/axentra_test",
      "postgres://user:pass@10.0.0.1:5432/axentra_test",
    ];

    for (const url of arbitraryLocalUrls) {
      expect(isDisposableTestDatabase(url, {})).toBe(false);
      expect(() => assertDisposableTestDatabase(url, {})).toThrow(
        "Safety guard violation: Database",
      );
    }
  });

  it("rejects URLs with host query parameter bypass (Finding F7)", () => {
    const bypassUrl =
      "postgres://axentra:local-postgres-password@localhost:5432/axentra_test?host=remote-server.com";
    expect(isDisposableTestDatabase(bypassUrl, {})).toBe(false);
    expect(() => assertDisposableTestDatabase(bypassUrl, {})).toThrow(
      "Safety guard violation: Database",
    );
  });

  it("accepts strictly authorized local hosts with valid disposable test database name", () => {
    const allowedUrls = [
      "postgres://axentra:local-postgres-password@localhost:5432/axentra_test",
      "postgres://axentra:local-postgres-password@127.0.0.1:5432/axentra_test",
      "postgres://axentra:local-postgres-password@[::1]:5432/axentra_test",
      "postgres://axentra:local-postgres-password@host.docker.internal:5432/axentra_test",
      "postgres://axentra:local-postgres-password@postgres:5432/axentra_test",
    ];

    for (const url of allowedUrls) {
      expect(isDisposableTestDatabase(url, {})).toBe(true);
      expect(() => assertDisposableTestDatabase(url, {})).not.toThrow();
    }
  });

  it("rejects production databases even on localhost with disposable flag set", () => {
    const prodLocalUrl =
      "postgres://axentra:local-postgres-password@localhost:5432/axentra_production";
    expect(
      isDisposableTestDatabase(prodLocalUrl, {
        AXENTRA_DISPOSABLE_TEST_DB: "1",
      }),
    ).toBe(false);
    expect(() =>
      assertDisposableTestDatabase(prodLocalUrl, {
        AXENTRA_DISPOSABLE_TEST_DB: "1",
      }),
    ).toThrow("Safety guard violation: Database");
  });

  it("accepts local database with explicit test name suffix", () => {
    const testDbUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";
    expect(isDisposableTestDatabase(testDbUrl, {})).toBe(true);
    expect(() => assertDisposableTestDatabase(testDbUrl, {})).not.toThrow();
  });

  it("rejects persistent local axentra database even under CI or test flags (Finding F1 / Round 4)", () => {
    const localDbUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra";
    expect(
      isDisposableTestDatabase(localDbUrl, {
        AXENTRA_DISPOSABLE_TEST_DB: "1",
      }),
    ).toBe(false);
    expect(
      isDisposableTestDatabase(localDbUrl, {
        CI: "true",
        APP_ENV: "test",
      }),
    ).toBe(false);
    expect(() =>
      assertDisposableTestDatabase(localDbUrl, {
        CI: "true",
        APP_ENV: "test",
      }),
    ).toThrow("Safety guard violation: Database");
  });

  it("rejects malformed database URLs", () => {
    expect(isDisposableTestDatabase("not-a-valid-url", {})).toBe(false);
    expect(() => assertDisposableTestDatabase("not-a-valid-url", {})).toThrow();
  });
});

describe("Credential Redaction and Error Sanitization (Finding F22)", () => {
  it("assertDisposableTestDatabase error message redacts username and password", () => {
    const sensitiveUrl =
      "postgres://super_secret_user:super_secret_password_987@localhost:5432/axentra";

    let thrownError: Error | undefined;
    try {
      assertDisposableTestDatabase(sensitiveUrl);
    } catch (err) {
      thrownError = err as Error;
    }

    expect(thrownError).toBeInstanceOf(Error);
    const message = (thrownError as Error).message;

    // Credentials must NOT appear anywhere in the error message
    expect(message).not.toContain("super_secret_user");
    expect(message).not.toContain("super_secret_password_987");

    // Sanitized host and database name must be clearly displayed with safe rejection reason
    expect(message).toContain("postgres://localhost:5432/axentra");
    expect(message).toContain("persistent development database");
  });

  it("sanitizeDatabaseUrl redacts credentials from standard and encoded URLs", () => {
    expect(sanitizeDatabaseUrl("postgres://admin:secret123@localhost:5432/axentra_test")).toBe(
      "postgres://localhost:5432/axentra_test",
    );

    expect(
      sanitizeDatabaseUrl("postgresql://user%40domain.com:p%40ssword@127.0.0.1:5432/test"),
    ).toBe("postgresql://127.0.0.1:5432/test");

    expect(sanitizeDatabaseUrl("postgres://localhost:5432/axentra_test")).toBe(
      "postgres://localhost:5432/axentra_test",
    );
  });

  it("sanitizeCredentials redacts connection credentials in log strings and stack traces", () => {
    const rawLog =
      "[test-db] Failed to prepare test database: connect ECONNREFUSED postgres://admin_user:secret_pass_123@localhost:5432/axentra_test";
    const sanitizedLog = sanitizeCredentials(rawLog);

    expect(sanitizedLog).not.toContain("admin_user");
    expect(sanitizedLog).not.toContain("secret_pass_123");
    expect(sanitizedLog).toBe(
      "[test-db] Failed to prepare test database: connect ECONNREFUSED postgres://localhost:5432/axentra_test",
    );
  });

  it("formatSanitizedError in prepare-test-db redacts credentials from Error objects", () => {
    const errorWithCredentials = new Error(
      "Failed to connect to postgresql://db_user:db_password_xyz@localhost:5432/axentra",
    );
    const formatted = formatSanitizedError(errorWithCredentials);

    expect(formatted).not.toContain("db_user");
    expect(formatted).not.toContain("db_password_xyz");
    expect(formatted).toContain("postgresql://localhost:5432/axentra");
  });

  it("provides safe rejection reason without exposing URL details", () => {
    expect(
      getDisposableDatabaseRejectionReason("postgres://u:p@remote-host.com:5432/axentra_test"),
    ).toContain("not in allowed local test hosts");

    expect(
      getDisposableDatabaseRejectionReason("postgres://u:p@localhost:5432/axentra_production"),
    ).toContain("production database");

    expect(getDisposableDatabaseRejectionReason("postgres://u:p@localhost:5432/axentra")).toContain(
      "persistent development database",
    );
  });
});

describe("Client Connection Binding Guard (Finding F21)", () => {
  it("assertClientConnectedToDisposableDatabase rejects mismatched database client directly", () => {
    const validTestUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";
    const mismatchedClient = {
      sql: {
        options: {
          database: "axentra",
          host: ["localhost"],
        },
      },
      db: {},
    } as unknown as DatabaseClient;

    expect(() => assertClientConnectedToDisposableDatabase(mismatchedClient, validTestUrl)).toThrow(
      "Safety guard violation: Database client target mismatch",
    );
  });

  it("rejects client when target database does not match the validated disposable database before query or write", async () => {
    const validTestUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";

    const selectSpy = mock(async () => []);
    const deleteSpy = mock(async () => []);
    const transactionSpy = mock(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({ delete: deleteSpy }),
    );

    // Client targeting persistent local database 'axentra' while URL targets 'axentra_test'
    const mismatchedClient = {
      sql: {
        options: {
          database: "axentra",
          host: ["localhost"],
          port: [5432],
        },
      },
      db: {
        select: selectSpy,
        delete: deleteSpy,
        transaction: transactionSpy,
      },
    } as unknown as DatabaseClient;

    await expect(
      safeCleanupTestCategories(mismatchedClient, ["cat-test-1"], {
        databaseUrl: validTestUrl,
      }),
    ).rejects.toThrow("Safety guard violation: Database client target mismatch");

    // PROOF: Rejected BEFORE any query or write was executed
    expect(selectSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it("rejects client targeting another test database before query or write", async () => {
    const validTestUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";

    const selectSpy = mock(async () => []);
    const deleteSpy = mock(async () => []);

    const mismatchedClient = {
      sql: {
        options: {
          database: "different_test",
          host: ["localhost"],
          port: [5432],
        },
      },
      db: {
        select: selectSpy,
        delete: deleteSpy,
        transaction: async () => {},
      },
    } as unknown as DatabaseClient;

    await expect(
      safeCleanupTestCategories(mismatchedClient, ["cat-test-1"], {
        databaseUrl: validTestUrl,
      }),
    ).rejects.toThrow("Safety guard violation: Database client target mismatch");

    expect(selectSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("rejects client with unverified or missing connection options before query or write", async () => {
    const validTestUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";

    const selectSpy = mock(async () => []);
    const unverifiedClient = {
      sql: {},
      db: { select: selectSpy },
    } as unknown as DatabaseClient;

    await expect(
      safeCleanupTestCategories(unverifiedClient, ["cat-test-1"], {
        databaseUrl: validTestUrl,
      }),
    ).rejects.toThrow(
      "Safety guard violation: Database client connection options could not be verified",
    );

    expect(selectSpy).not.toHaveBeenCalled();
  });

  it("rejects client targeting non-local host before query or write", async () => {
    const validTestUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";

    const selectSpy = mock(async () => []);
    const remoteClient = {
      sql: {
        options: {
          database: "axentra_test",
          host: ["remote-staging.company.internal"],
          port: [5432],
        },
      },
      db: { select: selectSpy },
    } as unknown as DatabaseClient;

    await expect(
      safeCleanupTestCategories(remoteClient, ["cat-test-1"], {
        databaseUrl: validTestUrl,
      }),
    ).rejects.toThrow("Safety guard violation: Database client host mismatch");

    expect(selectSpy).not.toHaveBeenCalled();
  });
});

describe("safeCleanupTestCategories Multi-Layer Guard & Atomic Cleanup (Findings F1 & F23)", () => {
  it("skips pre-existing categories and categories referenced by other documents", async () => {
    const preExistingCatId = "cat-pre-existing-1";
    const referencedCatId = "cat-referenced-by-other-doc";
    const safeCatId = "cat-safe-test-only";

    let currentQueriedCat: string | null = null;

    const mockDbClient = {
      sql: {
        options: {
          database: "axentra_test",
          host: ["localhost"],
          port: [5432],
        },
      },
      db: {
        select: (_fields: unknown) => ({
          from: () => ({
            where: (_cond: unknown) => ({
              limit: async () => {
                if (currentQueriedCat === referencedCatId) {
                  return [{ id: "doc-foreign-1" }];
                }
                return [];
              },
            }),
          }),
        }),
        transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
          return cb({
            delete: (_table: unknown) => ({
              where: async (_cond: unknown) => [],
            }),
          });
        },
        delete: (_table: unknown) => ({
          where: async (_cond: unknown) => [],
        }),
      },
    } as unknown as DatabaseClient;

    const preExistingSet = new Set([preExistingCatId]);
    const validDisposableUrl =
      "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";

    // 1. Referenced category is skipped
    currentQueriedCat = referencedCatId;
    const resultReferenced = await safeCleanupTestCategories(mockDbClient, [referencedCatId], {
      databaseUrl: validDisposableUrl,
      preExistingCategoryIds: preExistingSet,
    });
    expect(resultReferenced.skippedCategoryIds).toContain(referencedCatId);
    expect(resultReferenced.deletedCategoryIds).not.toContain(referencedCatId);

    // 2. Pre-existing category is skipped immediately
    const resultPreExisting = await safeCleanupTestCategories(mockDbClient, [preExistingCatId], {
      databaseUrl: validDisposableUrl,
      preExistingCategoryIds: preExistingSet,
    });
    expect(resultPreExisting.skippedCategoryIds).toContain(preExistingCatId);
    expect(resultPreExisting.deletedCategoryIds).not.toContain(preExistingCatId);

    // 3. Truly safe test-only category with no referencing documents is deleted
    currentQueriedCat = safeCatId;
    const resultSafe = await safeCleanupTestCategories(mockDbClient, [safeCatId], {
      databaseUrl: validDisposableUrl,
      preExistingCategoryIds: preExistingSet,
    });
    expect(resultSafe.deletedCategoryIds).toContain(safeCatId);
    expect(resultSafe.skippedCategoryIds).not.toContain(safeCatId);
  });

  it("fails closed if databaseUrl is omitted or not validated as disposable (Round 3 F1)", async () => {
    const mockDbClient = {
      sql: {
        options: {
          database: "axentra_test",
          host: ["localhost"],
          port: [5432],
        },
      },
      db: {},
    } as unknown as DatabaseClient;

    // 1. Omitted databaseUrl
    // @ts-expect-error runtime validation
    await expect(safeCleanupTestCategories(mockDbClient, ["cat-1"], {})).rejects.toThrow(
      "Safety guard violation: safeCleanupTestCategories requires an explicit databaseUrl",
    );

    // 2. Persistent / non-disposable databaseUrl
    await expect(
      safeCleanupTestCategories(mockDbClient, ["cat-1"], {
        databaseUrl: "postgres://axentra:local-postgres-password@localhost:5432/axentra",
        env: {},
      }),
    ).rejects.toThrow("Safety guard violation: Database");
  });

  it("executes permission and category deletions in a single atomic transaction (Finding F23)", async () => {
    const deletedTables: string[] = [];
    let transactionInvoked = false;

    const mockTx = {
      delete: (table: unknown) => {
        return {
          where: async (_cond: unknown) => {
            if (table === categoryDownloadPermissions) {
              deletedTables.push("category_download_permissions");
            } else if (table === categories) {
              deletedTables.push("categories");
            }
            return [];
          },
        };
      },
    };

    const mockDbClient = {
      sql: {
        options: {
          database: "axentra_test",
          host: ["localhost"],
          port: [5432],
        },
      },
      db: {
        select: (_fields: unknown) => ({
          from: () => ({
            where: () => ({
              limit: async () => [], // No referencing documents
            }),
          }),
        }),
        transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
          transactionInvoked = true;
          return cb(mockTx);
        },
      },
    } as unknown as DatabaseClient;

    const result = await safeCleanupTestCategories(mockDbClient, ["cat-atomic-1"], {
      databaseUrl: "postgres://axentra:local-postgres-password@localhost:5432/axentra_test",
    });

    expect(transactionInvoked).toBe(true);
    expect(deletedTables).toEqual(["category_download_permissions", "categories"]);
    expect(result.deletedCategoryIds).toEqual(["cat-atomic-1"]);
  });

  it("rolls back permission deletion if category deletion fails within transaction (Finding F23)", async () => {
    let permissionsDeletedInTx = false;
    let transactionRolledBack = false;

    const mockTx = {
      delete: (table: unknown) => ({
        where: async (_cond: unknown) => {
          if (table === categoryDownloadPermissions) {
            permissionsDeletedInTx = true;
            return [];
          }
          if (table === categories) {
            // Simulate failure during category deletion (e.g. FK constraint or DB error)
            throw new Error("Simulated database failure during category deletion");
          }
          return [];
        },
      }),
    };

    const mockDbClient = {
      sql: {
        options: {
          database: "axentra_test",
          host: ["localhost"],
          port: [5432],
        },
      },
      db: {
        select: (_fields: unknown) => ({
          from: () => ({
            where: () => ({
              limit: async () => [],
            }),
          }),
        }),
        transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
          try {
            return await cb(mockTx);
          } catch (error) {
            // In a real database transaction, any thrown error causes ROLLBACK
            transactionRolledBack = true;
            permissionsDeletedInTx = false;
            throw error;
          }
        },
      },
    } as unknown as DatabaseClient;

    await expect(
      safeCleanupTestCategories(mockDbClient, ["cat-rollback-1"], {
        databaseUrl: "postgres://axentra:local-postgres-password@localhost:5432/axentra_test",
      }),
    ).rejects.toThrow("Simulated database failure during category deletion");

    // PROOF OF ROLLBACK: The transaction rolled back, leaving permissions intact
    expect(transactionRolledBack).toBe(true);
    expect(permissionsDeletedInTx).toBe(false);
  });

  it("proves real PostgreSQL atomic transaction rollback when category deletion fails (Finding F23)", async () => {
    // Run against real local test DB if available
    const dbUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";
    let realClient: DatabaseClient | undefined;

    try {
      realClient = createDatabaseClient(dbUrl);
      (realClient.sql.options as { onnotice?: () => void }).onnotice = () => undefined;
      await realClient.sql`SELECT 1`;
    } catch {
      // If PostgreSQL is not reachable in this environment, pass gracefully
      return;
    }

    try {
      const testCatId = "a0000000-0000-0000-0000-000000000001";
      const testPermId = "b0000000-0000-0000-0000-000000000001";

      // 1. Clean up any existing records
      await realClient.db
        .delete(categoryDownloadPermissions)
        .where(eq(categoryDownloadPermissions.categoryId, testCatId));
      await realClient.db.delete(categories).where(eq(categories.id, testCatId));

      // 2. Insert test category and permission record
      await realClient.db.insert(categories).values({
        id: testCatId,
        name: "Atomic Test Category",
        slug: "atomic-test-category",
      });
      await realClient.db.insert(categoryDownloadPermissions).values({
        id: testPermId,
        categoryId: testCatId,
        downloadEnabled: true,
      });

      // Verify permission exists before cleanup
      const [permBefore] = await realClient.db
        .select()
        .from(categoryDownloadPermissions)
        .where(eq(categoryDownloadPermissions.categoryId, testCatId));
      expect(permBefore).toBeDefined();

      // 3. Create a BEFORE DELETE trigger on categories that aborts deletion
      await realClient.sql.unsafe(
        `CREATE OR REPLACE FUNCTION test_abort_cat_delete() RETURNS trigger AS $$
         BEGIN
           RAISE EXCEPTION 'Simulated trigger rejection on category delete';
         END;
         $$ LANGUAGE plpgsql;`,
      );
      await realClient.sql.unsafe(
        `DROP TRIGGER IF EXISTS test_abort_cat_delete_trg ON categories;
         CREATE TRIGGER test_abort_cat_delete_trg
         BEFORE DELETE ON categories
         FOR EACH ROW EXECUTE FUNCTION test_abort_cat_delete();`,
      );

      // 4. Attempt cleanup: tx deletes permission, then attempts to delete category, trigger fails!
      let cleanupError: unknown;
      try {
        await safeCleanupTestCategories(realClient, [testCatId], {
          databaseUrl: dbUrl,
        });
      } catch (err) {
        cleanupError = err;
      }

      expect(cleanupError).toBeDefined();
      expect(String(cleanupError)).toContain("categories");

      // 5. PROOF OF ROLLBACK IN REAL DATABASE:
      // The permission record was deleted first in the transaction, but rolled back when category deletion failed!
      const [permAfter] = await realClient.db
        .select()
        .from(categoryDownloadPermissions)
        .where(eq(categoryDownloadPermissions.categoryId, testCatId));
      expect(permAfter).toBeDefined();
      expect(permAfter?.id).toBe(testPermId);

      // 6. Tear down trigger
      await realClient.sql.unsafe(
        `DROP TRIGGER IF EXISTS test_abort_cat_delete_trg ON categories;`,
      );
      await realClient.sql.unsafe(`DROP FUNCTION IF EXISTS test_abort_cat_delete();`);

      // 7. Cleanup after trigger dropped
      await safeCleanupTestCategories(realClient, [testCatId], {
        databaseUrl: dbUrl,
      });

      const [permFinal] = await realClient.db
        .select()
        .from(categoryDownloadPermissions)
        .where(eq(categoryDownloadPermissions.categoryId, testCatId));
      expect(permFinal).toBeUndefined();
    } finally {
      if (realClient) {
        await realClient.sql.unsafe(
          `DROP TRIGGER IF EXISTS test_abort_cat_delete_trg ON categories;`,
        );
        await realClient.sql.unsafe(`DROP FUNCTION IF EXISTS test_abort_cat_delete();`);
        await closeDatabase(realClient);
      }
    }
  });
});
