import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import type {
  DatabaseClient,
  closeDatabase as CloseDatabase,
  createDatabaseClient as CreateDatabaseClient,
} from "@axentra/db";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? test : test.skip;

describe("Document Preview PostgreSQL integration (BE-S3-01 / AC-08.01)", () => {
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
    "verifies DrizzlePreviewRepository resolves preview targets, missing files, and soft-deleted documents in PostgreSQL",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [{ documentFiles, documents }, { DrizzlePreviewRepository }] = await Promise.all([
        import("@axentra/db"),
        import("../apps/api/src/modules/documents/preview.repository"),
      ]);

      const testId = crypto.randomUUID();
      const pdfDocId = crypto.randomUUID();
      const docxDocId = crypto.randomUUID();
      const deletedDocId = crypto.randomUUID();
      const noFileDocId = crypto.randomUUID();
      const missingDocId = crypto.randomUUID();

      const repo = new DrizzlePreviewRepository(database.db);

      try {
        await database.db.insert(documents).values([
          {
            id: pdfDocId,
            title: `Laporan-${testId}.pdf`,
            processingStatus: "completed",
          },
          {
            id: docxDocId,
            title: `Kontrak-${testId}.docx`,
            processingStatus: "completed",
          },
          {
            id: deletedDocId,
            title: `Terhapus-${testId}.pdf`,
            processingStatus: "completed",
            deletedAt: new Date(),
          },
          {
            id: noFileDocId,
            title: `TanpaFile-${testId}.pdf`,
            processingStatus: "queued",
          },
        ]);

        await database.db.insert(documentFiles).values([
          {
            documentId: pdfDocId,
            storageKey: `documents/${pdfDocId}/laporan.pdf`,
            originalName: "laporan.pdf",
            mimeType: "application/pdf",
            fileSize: 1024,
            fileExtension: "pdf",
          },
          {
            documentId: docxDocId,
            storageKey: `documents/${docxDocId}/kontrak.docx`,
            originalName: "kontrak.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            fileSize: 2048,
            fileExtension: "docx",
          },
          {
            documentId: deletedDocId,
            storageKey: `documents/${deletedDocId}/terhapus.pdf`,
            originalName: "terhapus.pdf",
            mimeType: "application/pdf",
            fileSize: 512,
            fileExtension: "pdf",
          },
        ]);

        const pdfTarget = await repo.findPreviewTarget(pdfDocId);
        expect(pdfTarget).not.toBeNull();
        expect(pdfTarget?.document.id).toBe(pdfDocId);
        expect(pdfTarget?.document.deletedAt).toBeNull();
        expect(pdfTarget?.file?.originalName).toBe("laporan.pdf");
        expect(pdfTarget?.file?.mimeType).toBe("application/pdf");
        expect(pdfTarget?.file?.fileSize).toBe(1024);

        const docxTarget = await repo.findPreviewTarget(docxDocId);
        expect(docxTarget).not.toBeNull();
        expect(docxTarget?.file?.originalName).toBe("kontrak.docx");
        expect(docxTarget?.file?.mimeType).toBe(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );

        const deletedTarget = await repo.findPreviewTarget(deletedDocId);
        expect(deletedTarget).not.toBeNull();
        expect(deletedTarget?.document.deletedAt).not.toBeNull();

        const noFileTarget = await repo.findPreviewTarget(noFileDocId);
        expect(noFileTarget).not.toBeNull();
        expect(noFileTarget?.file).toBeNull();

        const missingTarget = await repo.findPreviewTarget(missingDocId);
        expect(missingTarget).toBeNull();
      } finally {
        await database.db
          .delete(documentFiles)
          .where(inArray(documentFiles.documentId, [pdfDocId, docxDocId, deletedDocId]));
        await database.db
          .delete(documents)
          .where(inArray(documents.id, [pdfDocId, docxDocId, deletedDocId, noFileDocId]));
      }
    },
  );
});
