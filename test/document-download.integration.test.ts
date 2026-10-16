import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
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

        // Query audit event from real database
        const auditRows = await database.db
          .select()
          .from(downloadAuditEvents)
          .where(eq(downloadAuditEvents.documentId, docEnabledId));

        expect(auditRows.length).toBe(1);
        expect(auditRows[0]?.userId).toBe(userId);
        expect(auditRows[0]?.userName).toBe("Test User");
        expect(auditRows[0]?.documentName).toBe("laporan.pdf");
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
});
