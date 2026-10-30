import crypto from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import type {
  DatabaseClient,
  closeDatabase as CloseDatabase,
  createDatabaseClient as CreateDatabaseClient,
} from "@axentra/db";
import {
  assertClientConnectedToDisposableDatabase,
  assertDisposableTestDatabase,
} from "./helpers/disposable-database";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? test : test.skip;

describe("Analytics Summary PostgreSQL integration", () => {
  let database: DatabaseClient | undefined;
  let databaseUrl = "";
  let closeDatabase: CloseDatabase;
  let createDatabaseClient: CreateDatabaseClient;

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
    "counts active uploaded documents and documents uploaded in the last 7 days in PostgreSQL",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        { documentFiles, documents },
        { DrizzleAnalyticsRepository },
        { createAnalyticsService },
      ] = await Promise.all([
        import("@axentra/db"),
        import("../apps/api/src/modules/analytics/analytics.repository"),
        import("../apps/api/src/modules/analytics/analytics.service"),
      ]);

      const fixedNow = new Date("2026-10-30T12:00:00.000Z");
      const repository = new DrizzleAnalyticsRepository(database.db);
      const service = createAnalyticsService(repository, { now: () => fixedNow });

      const baseline = await service.getSummary();

      const suffix = crypto.randomUUID();
      const ids = {
        recentCompleted: crypto.randomUUID(),
        boundaryExact7Days: crypto.randomUUID(),
        olderCompleted: crypto.randomUUID(),
        softDeletedRecent: crypto.randomUUID(),
        missingFileRecent: crypto.randomUUID(),
      };
      const documentIds = [
        ids.recentCompleted,
        ids.boundaryExact7Days,
        ids.olderCompleted,
        ids.softDeletedRecent,
        ids.missingFileRecent,
      ];

      try {
        await database.db.insert(documents).values([
          {
            id: ids.recentCompleted,
            title: `Analytics recent ${suffix}`,
            processingStatus: "completed",
            createdAt: new Date("2026-10-29T12:00:00.000Z"),
          },
          {
            id: ids.boundaryExact7Days,
            title: `Analytics boundary ${suffix}`,
            processingStatus: "queued",
            createdAt: new Date("2026-10-23T12:00:00.000Z"),
          },
          {
            id: ids.olderCompleted,
            title: `Analytics older ${suffix}`,
            processingStatus: "completed",
            createdAt: new Date("2026-10-23T11:59:59.000Z"),
          },
          {
            id: ids.softDeletedRecent,
            title: `Analytics deleted ${suffix}`,
            processingStatus: "completed",
            createdAt: new Date("2026-10-30T01:00:00.000Z"),
            deletedAt: new Date("2026-10-30T02:00:00.000Z"),
          },
          {
            id: ids.missingFileRecent,
            title: `Analytics missing file ${suffix}`,
            processingStatus: "queued",
            createdAt: new Date("2026-10-30T01:00:00.000Z"),
          },
        ]);

        await database.db.insert(documentFiles).values([
          {
            id: crypto.randomUUID(),
            documentId: ids.recentCompleted,
            storageKey: `integration/${suffix}/recent.pdf`,
            originalName: "recent.pdf",
            mimeType: "application/pdf",
            fileSize: 120,
            fileExtension: "pdf",
          },
          {
            id: crypto.randomUUID(),
            documentId: ids.boundaryExact7Days,
            storageKey: `integration/${suffix}/boundary.pdf`,
            originalName: "boundary.pdf",
            mimeType: "application/pdf",
            fileSize: 120,
            fileExtension: "pdf",
          },
          {
            id: crypto.randomUUID(),
            documentId: ids.olderCompleted,
            storageKey: `integration/${suffix}/older.pdf`,
            originalName: "older.pdf",
            mimeType: "application/pdf",
            fileSize: 120,
            fileExtension: "pdf",
          },
          {
            id: crypto.randomUUID(),
            documentId: ids.softDeletedRecent,
            storageKey: `integration/${suffix}/deleted.pdf`,
            originalName: "deleted.pdf",
            mimeType: "application/pdf",
            fileSize: 120,
            fileExtension: "pdf",
          },
        ]);

        const afterInsert = await service.getSummary();
        expect(afterInsert.totalDocuments - baseline.totalDocuments).toBe(3);
        expect(afterInsert.uploadedLast7Days - baseline.uploadedLast7Days).toBe(2);
      } finally {
        assertDisposableTestDatabase(databaseUrl);
        assertClientConnectedToDisposableDatabase(database, databaseUrl);
        await database.db.delete(documents).where(inArray(documents.id, documentIds));
      }
    },
  );
});
