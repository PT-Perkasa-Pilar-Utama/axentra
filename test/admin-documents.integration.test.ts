import crypto from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
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

describe("Admin Document Management PostgreSQL integration (BE-S4-07 / PROP-ADM-AC-03.01 to 03.05)", () => {
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
    "lists, inspects, archives, unarchives, and soft-deletes documents while enforcing Member/Head exclusion",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        { categories, documentFiles, documentMetadata, documents, users },
        { DrizzleAdminRepository },
        { createAdminService },
        { DocumentRepository },
        { DocumentDetailRepository },
        { DrizzleSearchRepository },
      ] = await Promise.all([
        import("@axentra/db"),
        import("../apps/api/src/modules/admin/admin.repository"),
        import("../apps/api/src/modules/admin/admin.service"),
        import("../apps/api/src/modules/documents/documents.repository"),
        import("../apps/api/src/modules/documents/documents.detail.repository"),
        import("../apps/api/src/modules/search/search.repository"),
      ]);

      const fixedNow = new Date("2026-11-05T12:00:00.000Z");
      const adminRepo = new DrizzleAdminRepository(database.db);
      const adminService = createAdminService(adminRepo, { now: () => fixedNow });
      const docRepo = new DocumentRepository(database.db);
      const detailRepo = new DocumentDetailRepository(database.db);
      const searchRepo = new DrizzleSearchRepository(database.db);

      const suffix = crypto.randomUUID();
      const uploaderId = crypto.randomUUID();
      const categoryId = crypto.randomUUID();
      const activeDocId = crypto.randomUUID();
      const legacyDocId = crypto.randomUUID();
      const filelessDocId = crypto.randomUUID();

      try {
        await database.db.insert(users).values({
          id: uploaderId,
          email: `uploader-${suffix}@axentra.test`,
          name: "Rina Pratama",
          passwordHash: "dummy-hash",
          role: "member_team",
          status: "active",
        });

        await database.db.insert(categories).values({
          id: categoryId,
          name: `Reporting-${suffix}`,
          slug: `reporting-${suffix}`,
        });

        await database.db.insert(documents).values([
          {
            id: activeDocId,
            title: `Laporan-${suffix}.pdf`,
            uploadedBy: uploaderId,
            categoryId,
            processingStatus: "completed",
            createdAt: new Date("2099-11-05T10:00:00.000Z"),
          },
          {
            id: legacyDocId,
            title: `Legacy-${suffix}.pdf`,
            uploadedBy: null,
            categoryId: null,
            processingStatus: "completed",
            createdAt: new Date("2099-11-05T09:00:00.000Z"),
          },
          {
            id: filelessDocId,
            title: `Fileless-${suffix}.pdf`,
            uploadedBy: uploaderId,
            categoryId: null,
            processingStatus: "queued",
            createdAt: new Date("2099-11-05T11:00:00.000Z"),
          },
        ]);

        await database.db.insert(documentFiles).values([
          {
            id: crypto.randomUUID(),
            documentId: activeDocId,
            storageKey: `integration/${suffix}/active.pdf`,
            originalName: `Laporan-${suffix}.pdf`,
            mimeType: "application/pdf",
            fileSize: 2048,
            fileExtension: "pdf",
          },
          {
            id: crypto.randomUUID(),
            documentId: legacyDocId,
            storageKey: `integration/${suffix}/legacy.pdf`,
            originalName: `Legacy-${suffix}.pdf`,
            mimeType: "application/pdf",
            fileSize: 1024,
            fileExtension: "pdf",
          },
        ]);

        await database.db.insert(documentMetadata).values({
          documentId: activeDocId,
          author: "Rina Pratama",
          extractedText: `UniqueKeyword-${suffix}`,
          rawMetadata: { producer: "LibreOffice" },
          extractedAt: new Date("2099-11-05T10:01:00.000Z"),
        });

        // 1. Admin list includes activeDocId and legacyDocId, excludes filelessDocId
        const listResult = await adminService.listDocuments({ page: 1, limit: 10 });
        const listedIds = listResult.items.map((item) => item.id);
        expect(listedIds).toContain(activeDocId);
        expect(listedIds).toContain(legacyDocId);
        expect(listedIds).not.toContain(filelessDocId);

        // 2. Admin detail returns category and descriptive metadata only
        const detail = await adminService.getDocumentDetail(activeDocId);
        expect(detail).toEqual({
          id: activeDocId,
          title: `Laporan-${suffix}.pdf`,
          ownerId: uploaderId,
          ownerName: "Rina Pratama",
          uploadedAt: "2099-11-05T10:00:00.000Z",
          archivedAt: null,
          categoryId,
          categoryName: `Reporting-${suffix}`,
          metadata: {
            author: "Rina Pratama",
            extractedAt: "2099-11-05T10:01:00.000Z",
          },
        });

        // 3. Archive activeDocId -> omitted from Member/Head list, detail, and search, still visible to Admin
        const archived = await adminService.archiveDocument(activeDocId);
        expect(archived).toEqual({
          id: activeDocId,
          archivedAt: fixedNow.toISOString(),
        });

        // Idempotent second archive call preserves timestamp
        const archivedAgain = await adminService.archiveDocument(activeDocId);
        expect(archivedAgain.archivedAt).toBe(fixedNow.toISOString());

        expect(await detailRepo.findDocumentDetail(activeDocId)).toBeNull();
        const searchWhileArchived = await searchRepo.searchDocuments({
          q: `UniqueKeyword-${suffix}`,
          page: 1,
          limit: 20,
        });
        expect(searchWhileArchived.items).toEqual([]);

        const recentWhileArchived = await docRepo.listRecentDocuments(1, 20);
        expect(recentWhileArchived.items.map((d) => d.id)).not.toContain(activeDocId);

        const adminDetailWhileArchived = await adminService.getDocumentDetail(activeDocId);
        expect(adminDetailWhileArchived.archivedAt).toBe(fixedNow.toISOString());

        // 4. Unarchive activeDocId -> restored to Member/Head list, detail, and search
        const unarchived = await adminService.unarchiveDocument(activeDocId);
        expect(unarchived).toEqual({
          id: activeDocId,
          archivedAt: null,
        });
        expect(await detailRepo.findDocumentDetail(activeDocId)).not.toBeNull();
        const searchAfterUnarchive = await searchRepo.searchDocuments({
          q: `UniqueKeyword-${suffix}`,
          page: 1,
          limit: 20,
        });
        expect(searchAfterUnarchive.items.map((d) => d.id)).toEqual([activeDocId]);

        // 5. Soft-delete activeDocId -> removed from Admin and Member/Head, row and file kept in DB
        const deleted = await adminService.deleteDocument(activeDocId);
        expect(deleted).toEqual({
          id: activeDocId,
          deletedAt: fixedNow.toISOString(),
        });
        await expect(adminService.getDocumentDetail(activeDocId)).rejects.toThrow(
          "Dokumen tidak ditemukan",
        );
        await expect(adminService.deleteDocument(activeDocId)).rejects.toThrow(
          "Dokumen tidak ditemukan",
        );

        const [persistedRow] = await database.db
          .select()
          .from(documents)
          .where(eq(documents.id, activeDocId));
        expect(persistedRow?.deletedAt?.toISOString()).toBe(fixedNow.toISOString());
      } finally {
        await database.db
          .delete(documentMetadata)
          .where(inArray(documentMetadata.documentId, [activeDocId, legacyDocId, filelessDocId]));
        await database.db
          .delete(documentFiles)
          .where(inArray(documentFiles.documentId, [activeDocId, legacyDocId, filelessDocId]));
        await database.db
          .delete(documents)
          .where(inArray(documents.id, [activeDocId, legacyDocId, filelessDocId]));
        await database.db.delete(categories).where(eq(categories.id, categoryId));
        await database.db.delete(users).where(eq(users.id, uploaderId));
      }
    },
  );
});
