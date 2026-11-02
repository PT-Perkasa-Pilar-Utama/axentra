import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import type {
  DatabaseClient,
  closeDatabase as CloseDatabase,
  createDatabaseClient as CreateDatabaseClient,
} from "@axentra/db";
import { createLogger } from "@axentra/observability";
import { permissionCategoriesResponseSchema, type ApiErrorEnvelope } from "@axentra/shared";
import { createApp } from "../apps/api/src/app";
import type { TokenVerifier } from "../apps/api/src/middleware/auth";
import { DrizzlePermissionCategoriesRepository } from "../apps/api/src/modules/permission-categories/permission-categories.repository";
import { createPermissionCategoriesService } from "../apps/api/src/modules/permission-categories/permission-categories.service";
import {
  assertClientConnectedToDisposableDatabase,
  assertDisposableTestDatabase,
} from "./helpers/disposable-database";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? test : test.skip;

const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const tokenVerifier: TokenVerifier = {
  verifyToken(token: string) {
    if (token === "valid-head-token") {
      return {
        id: "11111111-1111-4111-8111-111111111111",
        email: "head@axentra.local",
        role: "head_of_team",
        name: "Head of Team",
      };
    }
    if (token === "valid-member-token") {
      return {
        id: "22222222-2222-4222-8222-222222222222",
        email: "member@axentra.local",
        role: "member_team",
        name: "Member Team",
      };
    }
    return null;
  },
};

describe("Permission categories API PostgreSQL integration (BE-S4-03 / AC-13.01)", () => {
  let database: DatabaseClient | undefined;
  let databaseUrl = "";
  let closeDatabase: typeof CloseDatabase;
  let createDatabaseClient: typeof CreateDatabaseClient;

  beforeAll(async () => {
    if (!runIntegrationTests) return;

    const [{ loadApiConfigFromRuntime }, db] = await Promise.all([
      import("@axentra/config"),
      import("@axentra/db"),
    ]);
    closeDatabase = db.closeDatabase;
    createDatabaseClient = db.createDatabaseClient;
    const config = loadApiConfigFromRuntime();
    assertDisposableTestDatabase(config.DATABASE_URL);
    databaseUrl = config.DATABASE_URL;
    database = createDatabaseClient(config.DATABASE_URL);
    assertClientConnectedToDisposableDatabase(database, databaseUrl);
    await db.checkDatabase(database);
  });

  afterAll(async () => {
    if (database !== undefined) await closeDatabase(database);
  });

  integrationTest(
    "returns categories sorted by name with active, inactive, and default-false download permissions for head_of_team",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const schema = await import("@axentra/db");
      const suffix = crypto.randomUUID();
      const activeCategoryId = crypto.randomUUID();
      const inactiveCategoryId = crypto.randomUUID();
      const unconfiguredCategoryId = crypto.randomUUID();
      const categoryIds = [activeCategoryId, inactiveCategoryId, unconfiguredCategoryId];

      const activeName = `00-PermCat-Active-${suffix}`;
      const inactiveName = `00-PermCat-Inactive-${suffix}`;
      const unconfiguredName = `00-PermCat-Unconfigured-${suffix}`;

      try {
        await database.db.insert(schema.categories).values([
          {
            id: inactiveCategoryId,
            name: inactiveName,
            slug: `permcat-inactive-${suffix}`,
          },
          {
            id: unconfiguredCategoryId,
            name: unconfiguredName,
            slug: `permcat-unconfigured-${suffix}`,
          },
          {
            id: activeCategoryId,
            name: activeName,
            slug: `permcat-active-${suffix}`,
          },
        ]);

        await database.db.insert(schema.categoryDownloadPermissions).values([
          {
            categoryId: activeCategoryId,
            downloadEnabled: true,
          },
          {
            categoryId: inactiveCategoryId,
            downloadEnabled: false,
          },
        ]);

        const app = createApp({
          logger: testLogger,
          version: "0.1.0",
          readinessChecks: [],
          tokenVerifier,
          permissionCategoriesService: createPermissionCategoriesService(
            new DrizzlePermissionCategoriesRepository(database.db),
          ),
        });

        const res = await app.request("/api/v1/permission-categories?limit=100", {
          method: "GET",
          headers: {
            Authorization: "Bearer valid-head-token",
          },
        });

        expect(res.status).toBe(200);
        const body = permissionCategoriesResponseSchema.parse(await res.json());

        const matching = body.data.filter((item) => categoryIds.includes(item.id));
        expect(matching.map((item) => item.name)).toEqual([
          activeName,
          inactiveName,
          unconfiguredName,
        ]);
        expect(matching.map((item) => item.downloadEnabled)).toEqual([true, false, false]);

        const memberRes = await app.request("/api/v1/permission-categories", {
          method: "GET",
          headers: {
            Authorization: "Bearer valid-member-token",
          },
        });
        expect(memberRes.status).toBe(403);
        const memberBody = (await memberRes.json()) as ApiErrorEnvelope;
        expect(memberBody.error.code).toBe("FORBIDDEN");
      } finally {
        assertDisposableTestDatabase(databaseUrl);
        assertClientConnectedToDisposableDatabase(database, databaseUrl);
        await database.db
          .delete(schema.categories)
          .where(inArray(schema.categories.id, categoryIds));
      }
    },
  );
});
