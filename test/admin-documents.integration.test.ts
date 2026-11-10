import crypto from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { asc, eq, inArray } from "drizzle-orm";
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
    "lists, inspects, archives, unarchives, soft-deletes with full retention and audit trail, and rebinds content hashes on re-upload",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        {
          adminDocumentAuditEvents,
          categories,
          documentContentHashes,
          documentFiles,
          documentMetadata,
          documents,
          users,
        },
        { DrizzleAdminDocumentRepository },
        { createAdminDocumentService },
        { DocumentRepository },
        { DocumentDetailRepository },
        { DrizzleDocumentContentHashRepository },
        { DrizzleSearchRepository },
      ] = await Promise.all([
        import("@axentra/db"),
        import("../apps/api/src/modules/admin/admin.documents.repository"),
        import("../apps/api/src/modules/admin/admin.documents.service"),
        import("../apps/api/src/modules/documents/documents.repository"),
        import("../apps/api/src/modules/documents/documents.detail.repository"),
        import("../apps/api/src/modules/documents/duplicate.repository"),
        import("../apps/api/src/modules/search/search.repository"),
      ]);

      const fixedNow = new Date("2026-11-05T12:00:00.000Z");
      const adminDocRepo = new DrizzleAdminDocumentRepository(database.db);
      const adminDocService = createAdminDocumentService(adminDocRepo, { now: () => fixedNow });
      const docRepo = new DocumentRepository(database.db);
      const detailRepo = new DocumentDetailRepository(database.db);
      const hashRepo = new DrizzleDocumentContentHashRepository(database.db);
      const searchRepo = new DrizzleSearchRepository(database.db);

      const suffix = crypto.randomUUID();
      const adminActorId = crypto.randomUUID();
      const uploaderId = crypto.randomUUID();
      const categoryId = crypto.randomUUID();
      const activeDocId = crypto.randomUUID();
      const legacyDocId = crypto.randomUUID();
      const filelessDocId = crypto.randomUUID();
      const reuploadedDocId = crypto.randomUUID();
      const sharedContentHash = crypto
        .createHash("sha256")
        .update(`content-${suffix}`)
        .digest("hex");

      const adminActor = {
        id: adminActorId,
        email: `admin-${suffix}@axentra.test`,
        role: "admin" as const,
        name: "Admin Reviewer",
      };

      const allDocIds = [activeDocId, legacyDocId, filelessDocId, reuploadedDocId];

      try {
        await database.db.insert(users).values([
          {
            id: adminActorId,
            email: adminActor.email,
            name: adminActor.name,
            passwordHash: "dummy-hash",
            role: "admin",
            status: "active",
          },
          {
            id: uploaderId,
            email: `uploader-${suffix}@axentra.test`,
            name: "Rina Pratama",
            passwordHash: "dummy-hash",
            role: "member_team",
            status: "active",
          },
        ]);

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

        await database.db.insert(documentContentHashes).values({
          id: crypto.randomUUID(),
          documentId: activeDocId,
          hashAlgorithm: "sha256",
          contentHash: sharedContentHash,
        });

        await database.db.insert(documentMetadata).values({
          documentId: activeDocId,
          author: "Rina Pratama",
          extractedText: `UniqueKeyword-${suffix}`,
          rawMetadata: { producer: "LibreOffice" },
          extractedAt: new Date("2099-11-05T10:01:00.000Z"),
        });

        // 1. Admin list includes activeDocId and legacyDocId, excludes filelessDocId
        const listResult = await adminDocService.listDocuments({ page: 1, limit: 10 });
        const listedIds = listResult.items.map((item) => item.id);
        expect(listedIds).toContain(activeDocId);
        expect(listedIds).toContain(legacyDocId);
        expect(listedIds).not.toContain(filelessDocId);

        // 2. Admin detail returns category and descriptive metadata only
        const detail = await adminDocService.getDocumentDetail(activeDocId);
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

        // 3. Archive activeDocId -> omitted from Member/Head list, detail, search, and duplicate check (F1)
        const archived = await adminDocService.archiveDocument({
          actor: adminActor,
          documentId: activeDocId,
        });
        expect(archived).toEqual({
          id: activeDocId,
          archivedAt: fixedNow.toISOString(),
        });

        // Idempotent second archive call preserves timestamp and writes no duplicate audit row (F2)
        const archivedAgain = await adminDocService.archiveDocument({
          actor: adminActor,
          documentId: activeDocId,
        });
        expect(archivedAgain.archivedAt).toBe(fixedNow.toISOString());

        expect(await detailRepo.findDocumentDetail(activeDocId)).toBeNull();
        expect(await hashRepo.findByContentHash(sharedContentHash)).toBeNull();
        expect(await docRepo.findByContentHash(sharedContentHash)).toBeNull();
        expect((await docRepo.findExistingHashes([sharedContentHash])).size).toBe(0);

        const searchWhileArchived = await searchRepo.searchDocuments({
          q: `UniqueKeyword-${suffix}`,
          page: 1,
          limit: 20,
        });
        expect(searchWhileArchived.items).toEqual([]);

        const recentWhileArchived = await docRepo.listRecentDocuments(1, 20);
        expect(recentWhileArchived.items.map((d) => d.id)).not.toContain(activeDocId);

        const adminDetailWhileArchived = await adminDocService.getDocumentDetail(activeDocId);
        expect(adminDetailWhileArchived.archivedAt).toBe(fixedNow.toISOString());

        // 4. Unarchive activeDocId -> restored to Member/Head list, detail, search, and duplicate check
        const unarchived = await adminDocService.unarchiveDocument({
          actor: adminActor,
          documentId: activeDocId,
        });
        expect(unarchived).toEqual({
          id: activeDocId,
          archivedAt: null,
        });
        // Idempotent repeat unarchive writes no duplicate audit row
        await adminDocService.unarchiveDocument({
          actor: adminActor,
          documentId: activeDocId,
        });

        expect(await detailRepo.findDocumentDetail(activeDocId)).not.toBeNull();
        expect((await hashRepo.findByContentHash(sharedContentHash))?.documentId).toBe(activeDocId);
        const searchAfterUnarchive = await searchRepo.searchDocuments({
          q: `UniqueKeyword-${suffix}`,
          page: 1,
          limit: 20,
        });
        expect(searchAfterUnarchive.items.map((d) => d.id)).toEqual([activeDocId]);

        // 5. Soft-delete activeDocId -> removed from Admin and Member/Head; documents, document_files, and document_metadata rows retained (F3 / PROP-ADM-AC-03.04)
        const deleted = await adminDocService.deleteDocument({
          actor: adminActor,
          documentId: activeDocId,
        });
        expect(deleted).toEqual({
          id: activeDocId,
          deletedAt: fixedNow.toISOString(),
        });
        await expect(adminDocService.getDocumentDetail(activeDocId)).rejects.toThrow(
          "Dokumen tidak ditemukan",
        );
        await expect(
          adminDocService.deleteDocument({ actor: adminActor, documentId: activeDocId }),
        ).rejects.toThrow("Dokumen tidak ditemukan");

        const [persistedDocRow] = await database.db
          .select()
          .from(documents)
          .where(eq(documents.id, activeDocId));
        expect(persistedDocRow?.deletedAt?.toISOString()).toBe(fixedNow.toISOString());

        const [persistedFileRow] = await database.db
          .select()
          .from(documentFiles)
          .where(eq(documentFiles.documentId, activeDocId));
        expect(persistedFileRow?.originalName).toBe(`Laporan-${suffix}.pdf`);
        expect(persistedFileRow?.storageKey).toBe(`integration/${suffix}/active.pdf`);

        const [persistedMetadataRow] = await database.db
          .select()
          .from(documentMetadata)
          .where(eq(documentMetadata.documentId, activeDocId));
        expect(persistedMetadataRow?.author).toBe("Rina Pratama");
        expect(persistedMetadataRow?.extractedText).toBe(`UniqueKeyword-${suffix}`);

        // 6. Verify audit events written in the same transaction for archive, unarchive, and delete (F2)
        const auditRows = await database.db
          .select()
          .from(adminDocumentAuditEvents)
          .where(eq(adminDocumentAuditEvents.documentId, activeDocId))
          .orderBy(asc(adminDocumentAuditEvents.changedAt), asc(adminDocumentAuditEvents.action));
        expect(auditRows.map((row) => row.action)).toEqual(["archive", "delete", "unarchive"]);
        for (const row of auditRows) {
          expect(row.documentTitle).toBe(`Laporan-${suffix}.pdf`);
          expect(row.actorUserId).toBe(adminActorId);
          expect(row.actorName).toBe("Admin Reviewer");
          expect(row.actorEmail).toBe(adminActor.email);
        }

        // 7. Re-upload file with the same content hash after soft-delete succeeds and rebinds hash row (F1)
        expect(await hashRepo.findByContentHash(sharedContentHash)).toBeNull();
        const savedBatch = await docRepo.saveDocumentBatch([
          {
            id: reuploadedDocId,
            title: `Laporan-Reupload-${suffix}.pdf`,
            uploadedBy: uploaderId,
            storageKey: `integration/${suffix}/reuploaded.pdf`,
            originalName: `Laporan-Reupload-${suffix}.pdf`,
            mimeType: "application/pdf",
            fileSize: 2048,
            fileExtension: "pdf",
            contentHash: sharedContentHash,
            hashAlgorithm: "sha256",
          },
        ]);
        expect(savedBatch).toHaveLength(1);
        expect((await hashRepo.findByContentHash(sharedContentHash))?.documentId).toBe(
          reuploadedDocId,
        );
      } finally {
        await database.db
          .delete(adminDocumentAuditEvents)
          .where(inArray(adminDocumentAuditEvents.documentId, allDocIds));
        await database.db
          .delete(documentContentHashes)
          .where(inArray(documentContentHashes.documentId, allDocIds));
        await database.db
          .delete(documentMetadata)
          .where(inArray(documentMetadata.documentId, allDocIds));
        await database.db.delete(documentFiles).where(inArray(documentFiles.documentId, allDocIds));
        await database.db.delete(documents).where(inArray(documents.id, allDocIds));
        await database.db.delete(categories).where(eq(categories.id, categoryId));
        await database.db.delete(users).where(inArray(users.id, [adminActorId, uploaderId]));
      }
    },
  );
});
