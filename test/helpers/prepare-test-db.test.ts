import { describe, expect, it } from "bun:test";
import { resolveTestDatabaseUrl } from "../../infra/local/prepare-test-db";

describe("Test Database Preparation Helper (Finding F5)", () => {
  it("resolves provided disposable URL when valid", () => {
    const customUrl = "postgres://axentra:local-postgres-password@localhost:5432/custom_test";
    expect(resolveTestDatabaseUrl(customUrl)).toBe(customUrl);
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
});
