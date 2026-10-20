import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
import type {
  DatabaseClient,
  closeDatabase as CloseDatabase,
  createDatabaseClient as CreateDatabaseClient,
} from "@axentra/db";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? test : test.skip;

describe("Document Download PostgreSQL integration (BE-S3-02 / AC-09.01)", () => {
  let database: DatabaseClient | undefined;
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
    database = createDatabaseClient(config.DATABASE_URL);
    await db.checkDatabase(database);
  });

  afterAll(async () => {
    if (database !== undefined) await closeDatabase(database);
  });

  integrationTest(
    "verifies DrizzleDownloadRepository finds download target and records audit events in PostgreSQL",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        {
          categories,
          categoryDownloadPermissions,
          documentFiles,
          documents,
          downloadAuditEvents,
          users,
        },
        { DrizzleDownloadRepository },
      ] = await Promise.all([
        import("@axentra/db"),
        import("../apps/api/src/modules/documents/download.repository"),
      ]);

      const testId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const categoryEnabledId = crypto.randomUUID();
      const categoryDisabledId = crypto.randomUUID();
      const docEnabledId = crypto.randomUUID();
      const docDisabledId = crypto.randomUUID();
      const fileEnabledId = crypto.randomUUID();
      const fileDisabledId = crypto.randomUUID();

      const repo = new DrizzleDownloadRepository(database.db);

      try {
        // Seed user
        await database.db.insert(users).values({
          id: userId,
          email: `test-${testId}@axentra.local`,
          name: "Test User",
          passwordHash: "dummy-hash",
          role: "member_team",
        });

        // Seed categories & permissions
        await database.db.insert(categories).values([
          {
            id: categoryEnabledId,
            name: `Reporting-${testId}`,
            slug: `reporting-${testId}`,
          },
          {
            id: categoryDisabledId,
            name: `Confidential-${testId}`,
            slug: `confidential-${testId}`,
          },
        ]);

        await database.db.insert(categoryDownloadPermissions).values([
          {
            categoryId: categoryEnabledId,
            downloadEnabled: true,
          },
          {
            categoryId: categoryDisabledId,
            downloadEnabled: false,
          },
        ]);

        // Seed documents
        await database.db.insert(documents).values([
          {
            id: docEnabledId,
            title: `Laporan-${testId}.pdf`,
            categoryId: categoryEnabledId,
            processingStatus: "completed",
          },
          {
            id: docDisabledId,
            title: `Rahasia-${testId}.docx`,
            categoryId: categoryDisabledId,
            processingStatus: "completed",
          },
        ]);

        // Seed document files
        await database.db.insert(documentFiles).values([
          {
            id: fileEnabledId,
            documentId: docEnabledId,
            storageKey: `documents/${docEnabledId}/laporan.pdf`,
            originalName: "laporan.pdf",
            mimeType: "application/pdf",
            fileSize: 1024,
            fileExtension: "pdf",
          },
          {
            id: fileDisabledId,
            documentId: docDisabledId,
            storageKey: `documents/${docDisabledId}/rahasia.docx`,
            originalName: "rahasia.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            fileSize: 2048,
            fileExtension: "docx",
          },
        ]);

        // Test findDownloadTarget for enabled category
        const targetEnabled = await repo.findDownloadTarget(docEnabledId);
        expect(targetEnabled).not.toBeNull();
        expect(targetEnabled?.document.id).toBe(docEnabledId);
        expect(targetEnabled?.file?.originalName).toBe("laporan.pdf");
        expect(targetEnabled?.file?.fileSize).toBe(1024);
        expect(targetEnabled?.categoryPermission?.downloadEnabled).toBe(true);

        // Test findDownloadTarget for disabled category
        const targetDisabled = await repo.findDownloadTarget(docDisabledId);
        expect(targetDisabled).not.toBeNull();
        expect(targetDisabled?.document.id).toBe(docDisabledId);
        expect(targetDisabled?.file?.originalName).toBe("rahasia.docx");
        expect(targetDisabled?.categoryPermission?.downloadEnabled).toBe(false);

        // Test findDownloadTargets (batch query for BE-S3-03)
        const batchTargets = await repo.findDownloadTargets([docEnabledId, docDisabledId]);
        expect(batchTargets).toHaveLength(2);
        const batchTargetMap = new Map(batchTargets.map((t) => [t.document.id, t]));
        expect(batchTargetMap.get(docEnabledId)?.file?.originalName).toBe("laporan.pdf");
        expect(batchTargetMap.get(docDisabledId)?.file?.originalName).toBe("rahasia.docx");

        // Test recordDownloadAuditEvent
        const downloadedAt = new Date();
        await repo.recordDownloadAuditEvent({
          userId,
          userName: "Test User",
          userEmail: `test-${testId}@axentra.local`,
          documentId: docEnabledId,
          documentName: "laporan.pdf",
          downloadedAt,
        });

        // Test recordDownloadAuditEvents (batch write for BE-S3-03)
        await repo.recordDownloadAuditEvents([
          {
            userId,
            userName: "Test User",
            userEmail: `test-${testId}@axentra.local`,
            documentId: docDisabledId,
            documentName: "rahasia.docx",
            downloadedAt,
          },
        ]);

        // Query audit event from real database
        const auditRows = await database.db
          .select()
          .from(downloadAuditEvents)
          .where(inArray(downloadAuditEvents.documentId, [docEnabledId, docDisabledId]));

        expect(auditRows.length).toBe(2);
        const auditDocNames = auditRows.map((r) => r.documentName).sort();
        expect(auditDocNames).toEqual(["laporan.pdf", "rahasia.docx"]);

        // Clean audit table before atomic tests
        await database.db
          .delete(downloadAuditEvents)
          .where(inArray(downloadAuditEvents.documentId, [docEnabledId, docDisabledId]));

        // Test checkCategoryPermissions with lock: share (F3, F6)
        const permStatuses = await repo.checkCategoryPermissions([docEnabledId, docDisabledId], {
          lock: "share",
        });
        expect(permStatuses).toHaveLength(2);
        const permMap = new Map(permStatuses.map((p) => [p.documentId, p]));
        expect(permMap.get(docEnabledId)?.downloadEnabled).toBe(true);
        expect(permMap.get(docDisabledId)?.downloadEnabled).toBe(false);

        // Test repo.transaction executing atomic queries and writes (F6)
        await repo.transaction(async (txRepo) => {
          const permsInTx = await txRepo.checkCategoryPermissions([docEnabledId], {
            lock: "share",
          });
          expect(permsInTx[0]?.downloadEnabled).toBe(true);
          await txRepo.recordDownloadAuditEvents([
            {
              userId,
              userName: "Test User",
              userEmail: `test-${testId}@axentra.local`,
              documentId: docEnabledId,
              documentName: "laporan.pdf",
              downloadedAt,
            },
          ]);
        });

        // Verify audit event written through transaction
        const txAuditRows = await database.db
          .select()
          .from(downloadAuditEvents)
          .where(eq(downloadAuditEvents.documentId, docEnabledId));
        expect(txAuditRows).toHaveLength(1);
        expect(txAuditRows[0]?.documentName).toBe("laporan.pdf");
      } finally {
        // Cleanup in reverse dependency order
        await database.db
          .delete(downloadAuditEvents)
          .where(inArray(downloadAuditEvents.documentId, [docEnabledId, docDisabledId]));
        await database.db
          .delete(documentFiles)
          .where(inArray(documentFiles.id, [fileEnabledId, fileDisabledId]));
        await database.db
          .delete(documents)
          .where(inArray(documents.id, [docEnabledId, docDisabledId]));
        await database.db
          .delete(categoryDownloadPermissions)
          .where(
            inArray(categoryDownloadPermissions.categoryId, [
              categoryEnabledId,
              categoryDisabledId,
            ]),
          );
        await database.db
          .delete(categories)
          .where(inArray(categories.id, [categoryEnabledId, categoryDisabledId]));
        await database.db.delete(users).where(eq(users.id, userId));
      }
    },
  );

  integrationTest(
    "serializes category permission verification with FOR SHARE lock against concurrent permission revocation (F3)",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        {
          categories,
          categoryDownloadPermissions,
          documentFiles,
          documents,
          downloadAuditEvents,
          users,
        },
        { DrizzleDownloadRepository },
      ] = await Promise.all([
        import("@axentra/db"),
        import("../apps/api/src/modules/documents/download.repository"),
      ]);

      const testId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const categoryId = crypto.randomUUID();
      const docId = crypto.randomUUID();
      const fileId = crypto.randomUUID();

      const repo = new DrizzleDownloadRepository(database.db);

      try {
        await database.db.insert(users).values({
          id: userId,
          email: `concurrent-${testId}@axentra.local`,
          name: "Concurrent Test User",
          passwordHash: "dummy-hash",
          role: "member_team",
        });

        await database.db.insert(categories).values({
          id: categoryId,
          name: `Concurrent-${testId}`,
          slug: `concurrent-${testId}`,
        });

        await database.db.insert(categoryDownloadPermissions).values({
          categoryId,
          downloadEnabled: true,
        });

        await database.db.insert(documents).values({
          id: docId,
          title: `Concurrent-${testId}.pdf`,
          categoryId,
          processingStatus: "completed",
        });

        await database.db.insert(documentFiles).values({
          id: fileId,
          documentId: docId,
          storageKey: `documents/${docId}/concurrent.pdf`,
          originalName: "concurrent.pdf",
          mimeType: "application/pdf",
          fileSize: 1024,
          fileExtension: "pdf",
        });

        // Warm up connection pool with idle connections to eliminate cold-pool latency variance (F11)
        await Promise.all([
          database.db.execute(sql`SELECT 1`),
          database.db.execute(sql`SELECT 1`),
          database.db.execute(sql`SELECT 1`),
        ]);

        let t1HasLock = false;
        let t1CanCommit = false;

        // T1 starts transaction, queries with lock: 'share', records audit, then commits
        const t1Promise = repo.transaction(async (txRepo) => {
          const perms = await txRepo.checkCategoryPermissions([docId], { lock: "share" });
          expect(perms).toHaveLength(1);
          expect(perms[0]?.downloadEnabled).toBe(true);

          t1HasLock = true;

          // Hold transaction open until T2 tests deterministic row lock contention
          while (!t1CanCommit) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }

          await txRepo.recordDownloadAuditEvents([
            {
              userId,
              userName: "Concurrent Test User",
              userEmail: `concurrent-${testId}@axentra.local`,
              documentId: docId,
              documentName: "concurrent.pdf",
              downloadedAt: new Date(),
            },
          ]);
        });

        // Wait until T1 acquires the SHARE lock
        while (!t1HasLock) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }

        let t2LockRejected = false;
        try {
          await database.db.transaction(async (tx2) => {
            await tx2.execute(
              sql`SELECT category_id FROM category_download_permissions WHERE category_id = ${categoryId} FOR UPDATE NOWAIT`,
            );
          });
        } catch (error: unknown) {
          const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
          const direct = error as { code?: string; message?: string };
          const code = cause?.code ?? direct?.code;
          const message = String(cause?.message ?? direct?.message ?? error);

          if (code === "55P03" || message.toLowerCase().includes("could not obtain lock")) {
            t2LockRejected = true;
          } else {
            throw error;
          }
        } finally {
          t1CanCommit = true;
        }

        // Deterministic assertion: T2 was blocked from acquiring exclusive lock while T1 holds SHARE lock
        expect(t2LockRejected).toBe(true);

        // Allow T1 to finish and commit
        await t1Promise;

        // Verify T1's audit event was safely committed
        const auditRows = await database.db
          .select()
          .from(downloadAuditEvents)
          .where(eq(downloadAuditEvents.documentId, docId));
        expect(auditRows).toHaveLength(1);

        // After T1 released the SHARE lock upon commit, T2's permission revocation succeeds
        await database.db
          .update(categoryDownloadPermissions)
          .set({ downloadEnabled: false })
          .where(eq(categoryDownloadPermissions.categoryId, categoryId));
      } finally {
        await database.db
          .delete(downloadAuditEvents)
          .where(eq(downloadAuditEvents.documentId, docId));
        await database.db.delete(documentFiles).where(eq(documentFiles.id, fileId));
        await database.db.delete(documents).where(eq(documents.id, docId));
        await database.db
          .delete(categoryDownloadPermissions)
          .where(eq(categoryDownloadPermissions.categoryId, categoryId));
        await database.db.delete(categories).where(eq(categories.id, categoryId));
        await database.db.delete(users).where(eq(users.id, userId));
      }
    },
  );
});
