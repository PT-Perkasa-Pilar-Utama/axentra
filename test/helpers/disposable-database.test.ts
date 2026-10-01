import { describe, expect, it } from "bun:test";
import {
  assertDisposableTestDatabase,
  isDisposableTestDatabase,
  safeCleanupTestCategories,
} from "./disposable-database";
import type { DatabaseClient } from "@axentra/db";

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

  it("accepts local database with explicit disposable environment flag", () => {
    const localDbUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra";
    expect(
      isDisposableTestDatabase(localDbUrl, {
        AXENTRA_DISPOSABLE_TEST_DB: "1",
      }),
    ).toBe(true);
    expect(() =>
      assertDisposableTestDatabase(localDbUrl, {
        AXENTRA_DISPOSABLE_TEST_DB: "1",
      }),
    ).not.toThrow();
  });

  it("accepts CI test environment", () => {
    const ciDbUrl = "postgres://axentra:local-postgres-password@localhost:5432/axentra";
    expect(
      isDisposableTestDatabase(ciDbUrl, {
        CI: "true",
        APP_ENV: "test",
      }),
    ).toBe(true);
  });

  it("rejects malformed database URLs", () => {
    expect(isDisposableTestDatabase("not-a-valid-url", {})).toBe(false);
    expect(() => assertDisposableTestDatabase("not-a-valid-url", {})).toThrow();
  });
});

describe("safeCleanupTestCategories Multi-Layer Guard (Finding F1)", () => {
  it("skips pre-existing categories and categories referenced by other documents", async () => {
    const preExistingCatId = "cat-pre-existing-1";
    const referencedCatId = "cat-referenced-by-other-doc";
    const safeCatId = "cat-safe-test-only";

    // Mock DatabaseClient
    const mockDbClient = {
      db: {
        select: (_fields: unknown) => ({
          from: (_table: unknown) => ({
            where: (_cond: unknown) => ({
              limit: async (_n: number) => {
                // Simulate: referencedCatId is referenced by a document in the DB
                return [{ id: "doc-foreign-1" }];
              },
            }),
          }),
        }),
        delete: (_table: unknown) => ({
          where: async (_cond: unknown) => {
            return [];
          },
        }),
      },
    } as unknown as DatabaseClient;

    // Test with preExisting exclusion
    const preExistingSet = new Set([preExistingCatId]);

    // When referencedCatId is queried, it returns a referencing doc, so it is skipped.
    // When safeCatId is queried, we need it to return empty array []
    let currentQueriedCat: string | null = null;
    (mockDbClient.db as unknown as { select: unknown }).select = () => ({
      from: () => ({
        where: (_cond: unknown) => {
          return {
            limit: async () => {
              if (currentQueriedCat === referencedCatId) {
                return [{ id: "doc-foreign-1" }];
              }
              return [];
            },
          };
        },
      }),
    });

    (mockDbClient.db as unknown as { delete: unknown }).delete = (_table: unknown) => ({
      where: async (_cond: unknown) => {
        return [];
      },
    });

    // Helper to run cleanup with current category mock tracking
    // For preExistingCatId, it should be skipped immediately without DB query
    // For referencedCatId, currentQueriedCat is set to referencedCatId -> returns doc -> skipped
    // For safeCatId, currentQueriedCat is set to safeCatId -> returns [] -> deleted
    currentQueriedCat = referencedCatId;
    const resultReferenced = await safeCleanupTestCategories(mockDbClient, [referencedCatId], {
      preExistingCategoryIds: preExistingSet,
    });
    expect(resultReferenced.skippedCategoryIds).toContain(referencedCatId);
    expect(resultReferenced.deletedCategoryIds).not.toContain(referencedCatId);

    // Pre-existing category is skipped immediately
    const resultPreExisting = await safeCleanupTestCategories(mockDbClient, [preExistingCatId], {
      preExistingCategoryIds: preExistingSet,
    });
    expect(resultPreExisting.skippedCategoryIds).toContain(preExistingCatId);
    expect(resultPreExisting.deletedCategoryIds).not.toContain(preExistingCatId);

    // Truly safe test-only category with no referencing documents is deleted
    currentQueriedCat = safeCatId;
    const resultSafe = await safeCleanupTestCategories(mockDbClient, [safeCatId], {
      preExistingCategoryIds: preExistingSet,
    });
    expect(resultSafe.deletedCategoryIds).toContain(safeCatId);
    expect(resultSafe.skippedCategoryIds).not.toContain(safeCatId);
  });
});
