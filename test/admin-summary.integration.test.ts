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

describe("Admin Summary PostgreSQL integration (BE-S4-05 / PROP-ADM-AC-01.01 to 01.03)", () => {
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
    "aggregates users per role, total & 7-day documents, and download count with latest timestamp in PostgreSQL",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        { documentFiles, documents, downloadAuditEvents, users },
        { DrizzleAdminRepository },
        { createAdminService },
      ] = await Promise.all([
        import("@axentra/db"),
        import("../apps/api/src/modules/admin/admin.repository"),
        import("../apps/api/src/modules/admin/admin.service"),
      ]);

      const fixedNow = new Date("2026-11-05T12:00:00.000Z");
      const repository = new DrizzleAdminRepository(database.db);
      const service = createAdminService(repository, { now: () => fixedNow });

      const baseline = await service.getSummary();

      const suffix = crypto.randomUUID();
      const userIds = {
        memberActive: crypto.randomUUID(),
        memberInactive: crypto.randomUUID(),
        headActive: crypto.randomUUID(),
        adminActive: crypto.randomUUID(),
      };

      const docIds = {
        recentCompleted: crypto.randomUUID(),
        boundaryExact7Days: crypto.randomUUID(),
        recentArchived: crypto.randomUUID(),
        olderCompleted: crypto.randomUUID(),
        softDeletedRecent: crypto.randomUUID(),
        missingFileRecent: crypto.randomUUID(),
      };

      const downloadIds = {
        dlEarlier: crypto.randomUUID(),
        dlLatest: crypto.randomUUID(),
      };

      try {
        await database.db.insert(users).values([
          {
            id: userIds.memberActive,
            email: `member-active-${suffix}@axentra.test`,
            name: "Member Active",
            passwordHash: "dummy-hash",
            role: "member_team",
            status: "active",
          },
          {
            id: userIds.memberInactive,
            email: `member-inactive-${suffix}@axentra.test`,
            name: "Member Inactive",
            passwordHash: "dummy-hash",
            role: "member_team",
            status: "inactive",
          },
          {
            id: userIds.headActive,
            email: `head-active-${suffix}@axentra.test`,
            name: "Head Active",
            passwordHash: "dummy-hash",
            role: "head_of_team",
            status: "active",
          },
          {
            id: userIds.adminActive,
            email: `admin-active-${suffix}@axentra.test`,
            name: "Admin Active",
            passwordHash: "dummy-hash",
            role: "admin",
            status: "active",
          },
        ]);

        await database.db.insert(documents).values([
          {
            id: docIds.recentCompleted,
            title: `Admin doc recent ${suffix}`,
            processingStatus: "completed",
            createdAt: new Date("2026-11-04T12:00:00.000Z"),
          },
          {
            id: docIds.boundaryExact7Days,
            title: `Admin doc boundary ${suffix}`,
            processingStatus: "queued",
            createdAt: new Date("2026-10-29T12:00:00.000Z"),
          },
          {
            id: docIds.recentArchived,
            title: `Admin doc archived ${suffix}`,
            processingStatus: "completed",
            createdAt: new Date("2026-11-04T08:00:00.000Z"),
            archivedAt: new Date("2026-11-04T10:00:00.000Z"),
          },
          {
            id: docIds.olderCompleted,
            title: `Admin doc older ${suffix}`,
            processingStatus: "completed",
            createdAt: new Date("2026-10-20T12:00:00.000Z"),
          },
          {
            id: docIds.softDeletedRecent,
            title: `Admin doc deleted ${suffix}`,
            processingStatus: "completed",
            createdAt: new Date("2026-11-04T01:00:00.000Z"),
            deletedAt: new Date("2026-11-04T02:00:00.000Z"),
          },
          {
            id: docIds.missingFileRecent,
            title: `Admin doc missing file ${suffix}`,
            processingStatus: "queued",
            createdAt: new Date("2026-11-04T01:00:00.000Z"),
          },
        ]);

        await database.db.insert(documentFiles).values([
          {
            id: crypto.randomUUID(),
            documentId: docIds.recentCompleted,
            storageKey: `integration/${suffix}/recent.pdf`,
            originalName: "recent.pdf",
            mimeType: "application/pdf",
            fileSize: 100,
            fileExtension: "pdf",
          },
          {
            id: crypto.randomUUID(),
            documentId: docIds.boundaryExact7Days,
            storageKey: `integration/${suffix}/boundary.pdf`,
            originalName: "boundary.pdf",
            mimeType: "application/pdf",
            fileSize: 100,
            fileExtension: "pdf",
          },
          {
            id: crypto.randomUUID(),
            documentId: docIds.recentArchived,
            storageKey: `integration/${suffix}/archived.pdf`,
            originalName: "archived.pdf",
            mimeType: "application/pdf",
            fileSize: 100,
            fileExtension: "pdf",
          },
          {
            id: crypto.randomUUID(),
            documentId: docIds.olderCompleted,
            storageKey: `integration/${suffix}/older.pdf`,
            originalName: "older.pdf",
            mimeType: "application/pdf",
            fileSize: 100,
            fileExtension: "pdf",
          },
          {
            id: crypto.randomUUID(),
            documentId: docIds.softDeletedRecent,
            storageKey: `integration/${suffix}/deleted.pdf`,
            originalName: "deleted.pdf",
            mimeType: "application/pdf",
            fileSize: 100,
            fileExtension: "pdf",
          },
        ]);

        await database.db.insert(downloadAuditEvents).values([
          {
            id: downloadIds.dlEarlier,
            userId: userIds.memberActive,
            userName: "Member Active",
            userEmail: `member-active-${suffix}@axentra.test`,
            documentId: docIds.recentCompleted,
            documentName: `Admin doc recent ${suffix}`,
            downloadedAt: new Date("2026-11-01T10:00:00.000Z"),
          },
          {
            id: downloadIds.dlLatest,
            userId: userIds.headActive,
            userName: "Head Active",
            userEmail: `head-active-${suffix}@axentra.test`,
            documentId: docIds.recentArchived,
            documentName: `Admin doc archived ${suffix}`,
            downloadedAt: new Date("2026-11-04T15:00:00.000Z"),
          },
        ]);

        const current = await service.getSummary();

        expect(current.usersByRole.member_team - baseline.usersByRole.member_team).toBe(2);
        expect(current.usersByRole.head_of_team - baseline.usersByRole.head_of_team).toBe(1);
        expect(current.usersByRole.admin - baseline.usersByRole.admin).toBe(1);

        // 4 valid stored docs (recent, boundary, archived, older)
        expect(current.totalDocuments - baseline.totalDocuments).toBe(4);
        // 3 uploaded in last 7 days (recent, boundary, archived)
        expect(current.uploadedLast7Days - baseline.uploadedLast7Days).toBe(3);

        expect(current.downloadCount - baseline.downloadCount).toBe(2);
        expect(current.latestDownloadAt).toBe("2026-11-04T15:00:00.000Z");
      } finally {
        await database.db
          .delete(downloadAuditEvents)
          .where(inArray(downloadAuditEvents.id, Object.values(downloadIds)));
        await database.db
          .delete(documentFiles)
          .where(inArray(documentFiles.documentId, Object.values(docIds)));
        await database.db.delete(documents).where(inArray(documents.id, Object.values(docIds)));
        await database.db.delete(users).where(inArray(users.id, Object.values(userIds)));
      }
    },
  );
});
