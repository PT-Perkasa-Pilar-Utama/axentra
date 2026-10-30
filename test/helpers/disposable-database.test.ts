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
import type { CleanupDatabaseClient, CleanupTransaction } from "./disposable-database";
import { formatSanitizedError } from "../../infra/local/prepare-test-db";
import { closeDatabase, createDatabaseClient } from "@axentra/db";
import { categories, categoryDownloadPermissions } from "@axentra/db";
import { eq } from "drizzle-orm";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? it : it.skip;

type MockCleanupClientOptions = {
  database?: string;
  host?: string | readonly string[];
  port?: number | readonly number[];
  selectDocs?: readonly { id: string }[];
  skipVerifiedBinding?: boolean;
  onSelect?: () => Promise<readonly { id: string }[]>;
  onDelete?: (table: unknown) => Promise<unknown>;
  onTransaction?: (tx: CleanupTransaction) => Promise<void> | void;
  onRollback?: (error: unknown) => void;
};

/**
 * Creates a strongly typed mock client satisfying CleanupDatabaseClient without unsafe casts (Finding F25).
 * Uses official createDatabaseClient to register verified database binding internally (Finding F21).
 */
function createMockCleanupClient(options: MockCleanupClientOptions = {}): CleanupDatabaseClient {
  if (options.skipVerifiedBinding) {
    let unverifiedHost = "localhost";
    if (options.host) {
      unverifiedHost = Array.isArray(options.host)
        ? (options.host[0] ?? "localhost")
        : options.host;
    }
    let unverifiedPort = 5432;
    if (options.port) {
      unverifiedPort = Array.isArray(options.port) ? (options.port[0] ?? 5432) : options.port;
    }

    const mockSql = {
      options: {
        database: options.database ?? "axentra_test",
        host: [unverifiedHost],
        port: [unverifiedPort],
      },
    };

    const mockDb = {
      select: (_fields: unknown) => ({
        from: (_table: unknown) => ({
          where: (_cond: unknown) => ({
            limit: async (_limit: number): Promise<readonly { id: string }[]> => {
              if (options.onSelect) {
                return await options.onSelect();
              }
              return options.selectDocs ?? [];
            },
          }),
        }),
      }),
      transaction: async <T>(cb: (tx: CleanupTransaction) => Promise<T>): Promise<T> => {
        const tx: CleanupTransaction = {
          delete: (_table: unknown) => ({
            where: async (_cond: unknown) => {
              if (options.onDelete) {
                return await options.onDelete(_table);
              }
              return [];
            },
          }),
        };
        return await cb(tx);
      },
    };

    return {
      db: mockDb,
      sql: mockSql,
    };
  }

  const dbName = options.database ?? "axentra_test";
  const rawHosts = options.host ?? ["localhost"];
  const hosts = Array.isArray(rawHosts) ? rawHosts : [rawHosts];
  const rawPorts = options.port ?? [5432];
  const ports = Array.isArray(rawPorts) ? rawPorts : [rawPorts];

  const hostPortPairs = hosts.map((h, i) => `${h}:${ports[i] ?? ports[0] ?? 5432}`).join(",");
  const clientUrl = `postgres://${hostPortPairs}/${dbName}`;

  const client = createDatabaseClient(clientUrl);

  Object.defineProperty(client.db, "select", {
    value: (_fields: unknown) => ({
      from: (_table: unknown) => ({
        where: (_cond: unknown) => ({
          limit: async (_limit: number): Promise<readonly { id: string }[]> => {
            if (options.onSelect) {
              return await options.onSelect();
            }
            return options.selectDocs ?? [];
          },
        }),
      }),
    }),
    configurable: true,
    writable: true,
  });

  Object.defineProperty(client.db, "transaction", {
    value: async <T>(cb: (tx: CleanupTransaction) => Promise<T>): Promise<T> => {
      const tx: CleanupTransaction = {
        delete: (_table: unknown) => ({
          where: async (_cond: unknown) => {
            if (options.onDelete) {
              return await options.onDelete(_table);
            }
            return [];
          },
        }),
      };

      if (options.onTransaction) {
        await options.onTransaction(tx);
      }

      try {
        return await cb(tx);
      } catch (error) {
        if (options.onRollback) {
          options.onRollback(error);
        }
        throw error;
      }
    },
    configurable: true,
    writable: true,
  });

  return client;
}

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
      if (err instanceof Error) {
        thrownError = err;
      }
    }

    expect(thrownError).toBeDefined();
    if (!thrownError) {
      throw new Error("Expected assertDisposableTestDatabase to throw an Error");
    }

    // Credentials must NOT appear anywhere in the error message
    expect(thrownError.message).not.toContain("super_secret_user");
    expect(thrownError.message).not.toContain("super_secret_password_987");

    // Sanitized host and database name must be clearly displayed with safe rejection reason
    expect(thrownError.message).toContain("postgres://localhost:5432/axentra");
    expect(thrownError.message).toContain("persistent development database");
  });

  it("assertDisposableTestDatabase redacts secret query parameters (Finding F22)", () => {
    const sensitiveQueryUrl =
      "postgres://super_user:pass123@localhost:5432/axentra?password=query_secret_token&token=abc123xyz";

    let thrownError: Error | undefined;
    try {
      assertDisposableTestDatabase(sensitiveQueryUrl);
    } catch (err) {
      if (err instanceof Error) {
        thrownError = err;
      }
    }

    expect(thrownError).toBeDefined();
    if (!thrownError) {
      throw new Error("Expected assertDisposableTestDatabase to throw an Error");
    }

    expect(thrownError.message).not.toContain("super_user");
    expect(thrownError.message).not.toContain("pass123");
    expect(thrownError.message).not.toContain("query_secret_token");
    expect(thrownError.message).not.toContain("abc123xyz");
    // Strict allowlist outputs only protocol://host:port/database without query parameters
    expect(thrownError.message).toContain("postgres://localhost:5432/axentra");
  });

  it("sanitizeDatabaseUrl redacts credentials from standard, encoded, and query parameter URLs (Finding F22)", () => {
    expect(sanitizeDatabaseUrl("postgres://admin:secret123@localhost:5432/axentra_test")).toBe(
      "postgres://localhost:5432/axentra_test",
    );

    expect(
      sanitizeDatabaseUrl("postgresql://user%40domain.com:p%40ssword@127.0.0.1:5432/test"),
    ).toBe("postgresql://127.0.0.1:5432/test");

    // Query parameters containing passwords or secrets are stripped via allowlist
    expect(
      sanitizeDatabaseUrl(
        "postgres://admin:secret123@localhost:5432/axentra_test?password=secret_query_val&sslmode=require",
      ),
    ).toBe("postgres://localhost:5432/axentra_test");

    expect(sanitizeDatabaseUrl("postgres://localhost:5432/axentra_test")).toBe(
      "postgres://localhost:5432/axentra_test",
    );
  });

  it("sanitizeDatabaseUrl redacts credentials from malformed URLs and query secrets (Finding F22)", () => {
    // Malformed URL with access_token and client_secret in query params
    const malformedUrlWithSecrets =
      "postgres://admin:secret123@invalid_host:not_a_port/axentra?access_token=secret_tok_123&client_secret=super_secret_client_val";
    const sanitized = sanitizeDatabaseUrl(malformedUrlWithSecrets);

    expect(sanitized).not.toContain("secret123");
    expect(sanitized).not.toContain("secret_tok_123");
    expect(sanitized).not.toContain("super_secret_client_val");
    expect(sanitized).not.toContain("access_token");
    expect(sanitized).not.toContain("client_secret");

    // Standard valid URL with access_token and client_secret is stripped to host/db
    const validUrlWithSecrets =
      "postgres://admin:secret123@localhost:5432/axentra_test?access_token=secret_tok_123&client_secret=super_secret_client_val";
    expect(sanitizeDatabaseUrl(validUrlWithSecrets)).toBe("postgres://localhost:5432/axentra_test");
  });

  it("sanitizeCredentials redacts access_token and client_secret query parameters (Finding F22)", () => {
    const rawText =
      "Error during auth: https://localhost:5432/callback?access_token=my_secret_access_token&client_secret=my_secret_client_pass&other=public";
    const sanitized = sanitizeCredentials(rawText);

    expect(sanitized).not.toContain("my_secret_access_token");
    expect(sanitized).not.toContain("my_secret_client_pass");
    expect(sanitized).toContain("access_token=***");
    expect(sanitized).toContain("client_secret=***");
    expect(sanitized).toContain("other=public");
  });

  it("sanitizeCredentials redacts connection credentials in log strings and stack traces (Finding F22)", () => {
    const rawLog =
      "[test-db] Failed to prepare test database: connect ECONNREFUSED postgres://admin_user:secret_pass_123@localhost:5432/axentra_test?password=query_secret_val&token=tok123";
    const sanitizedLog = sanitizeCredentials(rawLog);

    expect(sanitizedLog).not.toContain("admin_user");
    expect(sanitizedLog).not.toContain("secret_pass_123");
    expect(sanitizedLog).not.toContain("query_secret_val");
    expect(sanitizedLog).not.toContain("tok123");
    expect(sanitizedLog).toContain("password=***");
    expect(sanitizedLog).toContain("token=***");
  });

  it("formatSanitizedError in prepare-test-db redacts credentials from Error objects (Finding F22)", () => {
    const errorWithCredentials = new Error(
      "Failed to connect to postgresql://db_user:db_password_xyz@localhost:5432/axentra?password=leak_query_pw",
    );
    const formatted = formatSanitizedError(errorWithCredentials);

    expect(formatted).not.toContain("db_user");
    expect(formatted).not.toContain("db_password_xyz");
    expect(formatted).not.toContain("leak_query_pw");
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
  it("fails closed when client has no verified connection binding (Finding F21)", async () => {
    const validTestUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";

    const unverifiedClient = createMockCleanupClient({ skipVerifiedBinding: true });

    await expect(
      safeCleanupTestCategories(unverifiedClient, ["cat-test-1"], {
        databaseUrl: validTestUrl,
      }),
    ).rejects.toThrow("Safety guard violation: Database client has no verified connection binding");
  });

  it("assertClientConnectedToDisposableDatabase rejects mismatched database client directly (Finding F21)", () => {
    const validTestUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";
    const mismatchedClient = createMockCleanupClient({ database: "axentra" });

    expect(() => assertClientConnectedToDisposableDatabase(mismatchedClient, validTestUrl)).toThrow(
      "Safety guard violation: Database client target mismatch",
    );
  });

  it("rejects client when target database does not match the validated disposable database before query or write (Finding F21)", async () => {
    const validTestUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";

    const selectSpy = mock(async () => []);
    const deleteSpy = mock(async () => []);
    const transactionSpy = mock(async () => undefined);

    // Client targeting persistent local database 'axentra' while URL targets 'axentra_test'
    const mismatchedClient = createMockCleanupClient({
      database: "axentra",
      onSelect: selectSpy,
      onDelete: deleteSpy,
      onTransaction: transactionSpy,
    });

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

  it("rejects client targeting another test database before query or write (Finding F21)", async () => {
    const validTestUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";

    const selectSpy = mock(async () => []);
    const deleteSpy = mock(async () => []);

    const mismatchedClient = createMockCleanupClient({
      database: "different_test",
      onSelect: selectSpy,
      onDelete: deleteSpy,
    });

    await expect(
      safeCleanupTestCategories(mismatchedClient, ["cat-test-1"], {
        databaseUrl: validTestUrl,
      }),
    ).rejects.toThrow("Safety guard violation: Database client target mismatch");

    expect(selectSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("rejects client with different port before query or write (Finding F21)", async () => {
    const validTestUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";

    const selectSpy = mock(async () => []);
    const wrongPortClient = createMockCleanupClient({
      port: 5433,
      onSelect: selectSpy,
    });

    await expect(
      safeCleanupTestCategories(wrongPortClient, ["cat-test-1"], {
        databaseUrl: validTestUrl,
      }),
    ).rejects.toThrow("Safety guard violation: Database client port mismatch");

    expect(selectSpy).not.toHaveBeenCalled();
  });

  it("rejects client with multi-host configuration before query or write (Finding F21)", async () => {
    const validTestUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";

    const selectSpy = mock(async () => []);
    const multiHostClient = createMockCleanupClient({
      host: ["localhost", "127.0.0.1"],
      onSelect: selectSpy,
    });

    await expect(
      safeCleanupTestCategories(multiHostClient, ["cat-test-1"], {
        databaseUrl: validTestUrl,
      }),
    ).rejects.toThrow("Safety guard violation: Database client host mismatch");

    expect(selectSpy).not.toHaveBeenCalled();
  });

  it("rejects client targeting non-local host before query or write (Finding F21)", async () => {
    const validTestUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";

    const selectSpy = mock(async () => []);
    const remoteClient = createMockCleanupClient({
      host: ["remote-staging.company.internal"],
      onSelect: selectSpy,
    });

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

    const mockClient = createMockCleanupClient({
      onSelect: async () => {
        if (currentQueriedCat === referencedCatId) {
          return [{ id: "doc-foreign-1" }];
        }
        return [];
      },
    });

    const preExistingSet = new Set([preExistingCatId]);
    const validDisposableUrl =
      "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";

    // 1. Referenced category is skipped
    currentQueriedCat = referencedCatId;
    const resultReferenced = await safeCleanupTestCategories(mockClient, [referencedCatId], {
      databaseUrl: validDisposableUrl,
      preExistingCategoryIds: preExistingSet,
    });
    expect(resultReferenced.skippedCategoryIds).toContain(referencedCatId);
    expect(resultReferenced.deletedCategoryIds).not.toContain(referencedCatId);

    // 2. Pre-existing category is skipped immediately
    const resultPreExisting = await safeCleanupTestCategories(mockClient, [preExistingCatId], {
      databaseUrl: validDisposableUrl,
      preExistingCategoryIds: preExistingSet,
    });
    expect(resultPreExisting.skippedCategoryIds).toContain(preExistingCatId);
    expect(resultPreExisting.deletedCategoryIds).not.toContain(preExistingCatId);

    // 3. Truly safe test-only category with no referencing documents is deleted
    currentQueriedCat = safeCatId;
    const resultSafe = await safeCleanupTestCategories(mockClient, [safeCatId], {
      databaseUrl: validDisposableUrl,
      preExistingCategoryIds: preExistingSet,
    });
    expect(resultSafe.deletedCategoryIds).toContain(safeCatId);
    expect(resultSafe.skippedCategoryIds).not.toContain(safeCatId);
  });

  it("fails closed if databaseUrl is omitted or not validated as disposable (Round 3 F1)", async () => {
    const mockClient = createMockCleanupClient();

    // 1. Omitted databaseUrl
    // @ts-expect-error runtime validation
    await expect(safeCleanupTestCategories(mockClient, ["cat-1"], {})).rejects.toThrow(
      "Safety guard violation: safeCleanupTestCategories requires an explicit databaseUrl",
    );

    // 2. Persistent / non-disposable databaseUrl
    await expect(
      safeCleanupTestCategories(mockClient, ["cat-1"], {
        databaseUrl: "postgres://axentra:local-postgres-password@localhost:5432/axentra",
        env: {},
      }),
    ).rejects.toThrow("Safety guard violation: Database");
  });

  it("executes permission and category deletions in a single atomic transaction (Finding F23)", async () => {
    const deletedTables: string[] = [];
    let transactionInvoked = false;

    const mockClient = createMockCleanupClient({
      onTransaction: () => {
        transactionInvoked = true;
      },
      onDelete: async (table: unknown) => {
        if (table === categoryDownloadPermissions) {
          deletedTables.push("category_download_permissions");
        } else if (table === categories) {
          deletedTables.push("categories");
        }
        return [];
      },
    });

    const result = await safeCleanupTestCategories(mockClient, ["cat-atomic-1"], {
      databaseUrl: "postgres://axentra:local-postgres-password@localhost:5432/axentra_test",
    });

    expect(transactionInvoked).toBe(true);
    expect(deletedTables).toEqual(["category_download_permissions", "categories"]);
    expect(result.deletedCategoryIds).toEqual(["cat-atomic-1"]);
  });

  it("rolls back permission deletion if category deletion fails within transaction (Finding F23)", async () => {
    let permissionsDeletedInTx = false;
    let transactionRolledBack = false;

    const mockClient = createMockCleanupClient({
      onDelete: async (table: unknown) => {
        if (table === categoryDownloadPermissions) {
          permissionsDeletedInTx = true;
          return [];
        }
        if (table === categories) {
          throw new Error("Simulated database failure during category deletion");
        }
        return [];
      },
      onRollback: () => {
        transactionRolledBack = true;
        permissionsDeletedInTx = false;
      },
    });

    await expect(
      safeCleanupTestCategories(mockClient, ["cat-rollback-1"], {
        databaseUrl: "postgres://axentra:local-postgres-password@localhost:5432/axentra_test",
      }),
    ).rejects.toThrow("Simulated database failure during category deletion");

    // PROOF OF ROLLBACK: The transaction rolled back, leaving permissions intact
    expect(transactionRolledBack).toBe(true);
    expect(permissionsDeletedInTx).toBe(false);
  });

  integrationTest(
    "proves real PostgreSQL atomic transaction rollback when category deletion fails (Findings F23, F24)",
    async () => {
      const dbUrl =
        Bun.env.TEST_DATABASE_URL ??
        Bun.env.DATABASE_URL ??
        "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";
      const realClient = createDatabaseClient(dbUrl);
      await realClient.sql.unsafe("SET client_min_messages TO warning;");

      // Unique resource names generated per test run (Finding F24)
      const testCatId = crypto.randomUUID();
      const testPermId = crypto.randomUUID();
      const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
      const triggerFnName = `test_abort_cat_del_${suffix}`;
      const triggerName = `trg_abort_cat_del_${suffix}`;

      try {
        // 1. Insert test category and permission record
        await realClient.db.insert(categories).values({
          id: testCatId,
          name: `Atomic Test Category ${suffix}`,
          slug: `atomic-test-category-${suffix}`,
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

        // 2. Create a BEFORE DELETE trigger on categories that aborts deletion strictly for this test fixture (Finding F26)
        await realClient.sql.unsafe(
          `CREATE OR REPLACE FUNCTION ${triggerFnName}() RETURNS trigger AS $$
           BEGIN
             IF OLD.id = '${testCatId}'::uuid THEN
               RAISE EXCEPTION 'Simulated trigger rejection on category delete';
             END IF;
             RETURN OLD;
           END;
           $$ LANGUAGE plpgsql;`,
        );
        await realClient.sql.unsafe(
          `DROP TRIGGER IF EXISTS ${triggerName} ON categories;
           CREATE TRIGGER ${triggerName}
           BEFORE DELETE ON categories
           FOR EACH ROW EXECUTE FUNCTION ${triggerFnName}();`,
        );

        // 3. Attempt cleanup: tx deletes permission, then attempts to delete category, trigger fails!
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

        // 4. PROOF OF ROLLBACK IN REAL DATABASE:
        // The permission record was deleted first in the transaction, but rolled back when category deletion failed!
        const [permAfter] = await realClient.db
          .select()
          .from(categoryDownloadPermissions)
          .where(eq(categoryDownloadPermissions.categoryId, testCatId));
        expect(permAfter).toBeDefined();
        expect(permAfter?.id).toBe(testPermId);

        // 5. Tear down trigger
        await realClient.sql.unsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON categories;`);
        await realClient.sql.unsafe(`DROP FUNCTION IF EXISTS ${triggerFnName}();`);

        // 6. Cleanup after trigger dropped
        await safeCleanupTestCategories(realClient, [testCatId], {
          databaseUrl: dbUrl,
        });

        const [permFinal] = await realClient.db
          .select()
          .from(categoryDownloadPermissions)
          .where(eq(categoryDownloadPermissions.categoryId, testCatId));
        expect(permFinal).toBeUndefined();
      } finally {
        // Clean up only the resources created by this test (Finding F24)
        await realClient.sql.unsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON categories;`);
        await realClient.sql.unsafe(`DROP FUNCTION IF EXISTS ${triggerFnName}();`);
        await realClient.db
          .delete(categoryDownloadPermissions)
          .where(eq(categoryDownloadPermissions.categoryId, testCatId));
        await realClient.db.delete(categories).where(eq(categories.id, testCatId));
        await closeDatabase(realClient);
      }
    },
  );
});
