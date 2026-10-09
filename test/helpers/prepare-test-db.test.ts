import { describe, expect, it } from "bun:test";
import { ensureTestDatabaseReady, resolveTestDatabaseUrl } from "../../infra/local/prepare-test-db";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? it : it.skip;

describe("Test Database Preparation Helper (Finding F5)", () => {
  it("resolves provided disposable URL when valid", () => {
    const customUrl = "postgres://axentra:local-postgres-password@localhost:5432/custom_test";
    expect(resolveTestDatabaseUrl(customUrl)).toBe(customUrl);
  });

  it("rejects non-local .local hostnames in resolveTestDatabaseUrl (Finding F7)", () => {
    const remoteLocalUrl =
      "postgres://axentra:local-postgres-password@shared-db.internal.local:5432/axentra_test";
    expect(() => resolveTestDatabaseUrl(remoteLocalUrl)).toThrow("Safety guard violation");
  });

  it("rejects non-local .local hostnames in ensureTestDatabaseReady (Finding F7)", async () => {
    const remoteLocalUrl =
      "postgres://axentra:local-postgres-password@shared-db.internal.local:5432/axentra_test";
    await expect(ensureTestDatabaseReady(remoteLocalUrl)).rejects.toThrow("Safety guard violation");
  });

  it("derives test database name from persistent local DATABASE_URL", () => {
    const origDbUrl = Bun.env.DATABASE_URL;
    const origTestDbUrl = Bun.env.TEST_DATABASE_URL;
    try {
      delete Bun.env.TEST_DATABASE_URL;
      Bun.env.DATABASE_URL = "postgres://axentra:local-postgres-password@localhost:5432/axentra";
      const resolved = resolveTestDatabaseUrl();
      expect(resolved).toBe(
        "postgres://axentra:local-postgres-password@localhost:5432/axentra_test",
      );
    } finally {
      if (origDbUrl !== undefined) Bun.env.DATABASE_URL = origDbUrl;
      else delete Bun.env.DATABASE_URL;
      if (origTestDbUrl !== undefined) Bun.env.TEST_DATABASE_URL = origTestDbUrl;
      else delete Bun.env.TEST_DATABASE_URL;
    }
  });

  it("respects explicit TEST_DATABASE_URL when set", () => {
    const origDbUrl = Bun.env.DATABASE_URL;
    const origTestDbUrl = Bun.env.TEST_DATABASE_URL;
    try {
      Bun.env.DATABASE_URL = "postgres://axentra:local-postgres-password@localhost:5432/axentra";
      Bun.env.TEST_DATABASE_URL =
        "postgres://axentra:local-postgres-password@localhost:5432/ci_isolated_test";
      const resolved = resolveTestDatabaseUrl();
      expect(resolved).toBe(
        "postgres://axentra:local-postgres-password@localhost:5432/ci_isolated_test",
      );
    } finally {
      if (origDbUrl !== undefined) Bun.env.DATABASE_URL = origDbUrl;
      else delete Bun.env.DATABASE_URL;
      if (origTestDbUrl !== undefined) Bun.env.TEST_DATABASE_URL = origTestDbUrl;
      else delete Bun.env.TEST_DATABASE_URL;
    }
  });

  it("falls back to default axentra_test URL when no valid test environment is found", () => {
    const origDbUrl = Bun.env.DATABASE_URL;
    const origTestDbUrl = Bun.env.TEST_DATABASE_URL;
    try {
      delete Bun.env.DATABASE_URL;
      delete Bun.env.TEST_DATABASE_URL;
      const resolved = resolveTestDatabaseUrl();
      expect(resolved).toBe(
        "postgres://axentra:local-postgres-password@localhost:5432/axentra_test",
      );
    } finally {
      if (origDbUrl !== undefined) Bun.env.DATABASE_URL = origDbUrl;
      else delete Bun.env.DATABASE_URL;
      if (origTestDbUrl !== undefined) Bun.env.TEST_DATABASE_URL = origTestDbUrl;
      else delete Bun.env.TEST_DATABASE_URL;
    }
  });

  integrationTest(
    "idempotently provisions missing test database via CREATE DATABASE and applies migrations (Finding F5)",
    async () => {
      const postgres = (await import("postgres")).default;

      const targetTestDbName = "axentra_missing_prov_test";
      const targetTestDbUrl = `postgres://axentra:local-postgres-password@localhost:5432/${targetTestDbName}`;

      // 1. Setup: Connect to maintenance DB and ensure target test database is dropped first
      const adminSql = postgres(
        "postgres://axentra:local-postgres-password@localhost:5432/axentra",
        {
          max: 1,
          onnotice: () => undefined,
        },
      );

      try {
        await adminSql.unsafe(`DROP DATABASE IF EXISTS "${targetTestDbName}"`);

        // Verify it does NOT exist before running ensureTestDatabaseReady
        const preCheck =
          await adminSql`SELECT 1 FROM pg_database WHERE datname = ${targetTestDbName}`;
        expect(preCheck.length).toBe(0);

        // 2. Call ensureTestDatabaseReady against the missing database URL
        const preparedUrl = await ensureTestDatabaseReady(targetTestDbUrl);
        expect(preparedUrl).toBe(targetTestDbUrl);

        // 3. Verify database was actually created in PostgreSQL
        const postCheck =
          await adminSql`SELECT 1 FROM pg_database WHERE datname = ${targetTestDbName}`;
        expect(postCheck.length).toBe(1);

        // 4. Verify migrations were actually applied to the newly created database
        const testDbSql = postgres(targetTestDbUrl, { max: 1, onnotice: () => undefined });
        try {
          const migrations =
            await testDbSql`SELECT id, hash, created_at FROM "drizzle"."__drizzle_migrations"`;
          expect(migrations.length).toBeGreaterThan(0);

          // Verify application tables were created
          const catTableCheck = await testDbSql`SELECT 1 FROM categories LIMIT 1`;
          expect(catTableCheck).toBeDefined();
        } finally {
          await testDbSql.end();
        }

        // 5. Verify idempotency: calling ensureTestDatabaseReady a second time succeeds without error
        await expect(ensureTestDatabaseReady(targetTestDbUrl)).resolves.toBe(targetTestDbUrl);
      } finally {
        // Teardown: Clean up temporary test database
        await adminSql.unsafe(`DROP DATABASE IF EXISTS "${targetTestDbName}"`);
        await adminSql.end();
      }
    },
  );
});
