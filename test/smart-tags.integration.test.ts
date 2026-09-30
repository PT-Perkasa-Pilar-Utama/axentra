import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import type {
  DatabaseClient,
  closeDatabase as CloseDatabase,
  createDatabaseClient as CreateDatabaseClient,
} from "@axentra/db";
import type { StorageAdapter } from "@axentra/storage";
import { documentSmartTagsResponseSchema } from "@axentra/shared";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? test : test.skip;

describe("Smart Tags PostgreSQL integration (Task BE-S2-01 / AC-04.02)", () => {
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
    "end-to-end worker to HTTP route: processes document with realistic body text and hex operands, persists tags atomically in PostgreSQL, and serves via GET /api/v1/documents/:id/smart-tags",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        { documents, documentFiles, documentSmartTags },
        { DrizzleDocumentSmartTagsRepository },
        { DrizzleDocumentProcessingRepository },
        { processDocumentJob },
        { createApp },
        { createDocumentService },
        { createLogger },
      ] = await Promise.all([
        import("@axentra/db"),
        import("../apps/api/src/modules/documents/smart-tags.repository"),
        import("../apps/worker/src/processors/document.processor.repository"),
        import("../apps/worker/src/processors/document.processor"),
        import("../apps/api/src/app"),
        import("../apps/api/src/modules/documents/documents.service"),
        import("@axentra/observability"),
      ]);

      const suffix = crypto.randomUUID().slice(0, 8);
      const docId = crypto.randomUUID();
      const fileId = crypto.randomUUID();
      const storageKey = `integration-tests/${docId}/audit-budget-procurement.pdf`;

      // Realistic PDF with both literal strings and hex operands (F2)
      // <616e642066696e616e6369616c206175646974> = "and financial audit"
      // <70726f637572656d656e74> = "procurement"
      const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 150 >>
stream
BT
/F1 12 Tf
(This report details the annual fiscal budget allocation ) Tj
<616e642066696e616e6369616c206175646974> Tj
[10 <70726f637572656d656e74>] TJ
ET
endstream
endobj
xref
0 5
trailer
<< /Root 1 0 R >>
%%EOF`;
      const pdfBuffer = Buffer.from(pdfContent, "latin1");

      const storageMap = new Map<string, Uint8Array>();
      storageMap.set(storageKey, pdfBuffer);

      const storage: StorageAdapter = {
        async getObject(key: string) {
          const item = storageMap.get(key);
          if (!item) throw new Error(`Object not found in storage: ${key}`);
          return item;
        },
        async putObject(input) {
          storageMap.set(input.key, input.body);
          return { key: input.key, etag: "mock-etag" };
        },
        async deleteObject(key: string) {
          storageMap.delete(key);
        },
        async headObject(key: string) {
          const item = storageMap.get(key);
          if (!item) return null;
          return { contentLength: item.length, lastModified: new Date() };
        },
        async initialize() {},
        async getDownloadUrl(key: string) {
          return `http://localhost:9000/documents/${key}`;
        },
      };

      const workerRepo = new DrizzleDocumentProcessingRepository(database.db);
      const apiSmartTagsRepo = new DrizzleDocumentSmartTagsRepository(database.db);

      const documentService = createDocumentService({
        smartTagsRepository: apiSmartTagsRepo,
      });

      const tokenVerifier = {
        async verifyToken(token: string) {
          if (token === "integration-member-token") {
            return {
              userId: "user-1",
              email: "member@axentra.local",
              role: "member_team" as const,
              name: "Integration Member",
            };
          }
          if (token === "integration-unauthorized-role-token") {
            return {
              userId: "user-2",
              email: "viewer@axentra.local",
              role: "viewer" as unknown as "member_team",
              name: "Unauthorized Viewer",
            };
          }
          return null;
        },
      };

      const logger = createLogger({
        service: "axentra-api-test",
        environment: "test",
        version: "0.1.0",
        level: "fatal",
      });

      const app = createApp({
        logger,
        version: "0.1.0",
        readinessChecks: [],
        tokenVerifier,
        documentService,
      });

      try {
        // 1. Insert initial document in queued state
        await database.db.insert(documents).values({
          id: docId,
          title: `Realistic Test Doc ${suffix}`,
          processingStatus: "queued",
        });

        // 2. Insert document file record
        await database.db.insert(documentFiles).values({
          id: fileId,
          documentId: docId,
          storageKey,
          originalName: "unrelated-filename-123.pdf",
          mimeType: "application/pdf",
          fileSize: pdfBuffer.length,
          fileExtension: "pdf",
        });

        // 3. Process document through worker pipeline
        await processDocumentJob(
          {
            jobId: `job-${suffix}`,
            documentId: docId,
            schemaVersion: 1,
            enqueuedAt: new Date().toISOString(),
          },
          {
            repository: workerRepo,
            storage,
          },
        );

        // 4. Verify PostgreSQL persistence
        const [updatedDoc] = await database.db
          .select()
          .from(documents)
          .where(inArray(documents.id, [docId]));
        expect(updatedDoc?.processingStatus).toBe("completed");
        expect(updatedDoc?.errorMessage).toBeNull();

        const docTags = await apiSmartTagsRepo.findSmartTagsByDocumentId(docId);
        expect(docTags.length).toBe(3);
        const tagNames = docTags.map((t) => t.name);
        expect(tagNames).toContain("audit");
        expect(tagNames).toContain("budget");
        expect(tagNames).toContain("procurement");

        // 5. Verify HTTP route GET /api/v1/documents/:id/smart-tags
        const response = await app.request(`/api/v1/documents/${docId}/smart-tags`, {
          method: "GET",
          headers: {
            authorization: "Bearer integration-member-token",
          },
        });

        expect(response.status).toBe(200);
        const body = documentSmartTagsResponseSchema.parse(await response.json());
        expect(body.success).toBe(true);
        expect(body.data.length).toBe(3);
        const httpTagNames = body.data.map((t) => t.name);
        expect(httpTagNames).toContain("audit");
        expect(httpTagNames).toContain("budget");
        expect(httpTagNames).toContain("procurement");

        // 6. Verify HTTP route guards
        // Unauthorized (missing token)
        const unauthRes = await app.request(`/api/v1/documents/${docId}/smart-tags`, {
          method: "GET",
        });
        expect(unauthRes.status).toBe(401);

        // Forbidden (unauthorized role)
        const forbiddenRes = await app.request(`/api/v1/documents/${docId}/smart-tags`, {
          method: "GET",
          headers: {
            authorization: "Bearer integration-unauthorized-role-token",
          },
        });
        expect(forbiddenRes.status).toBe(403);
      } finally {
        // Cleanup PostgreSQL
        await database.db.delete(documentFiles).where(inArray(documentFiles.id, [fileId]));
        await database.db
          .delete(documentSmartTags)
          .where(inArray(documentSmartTags.documentId, [docId]));
        await database.db.delete(documents).where(inArray(documents.id, [docId]));
      }
    },
  );

  integrationTest(
    "failure handling and transaction rollback: rolls back all transaction writes and marks document as failed when database write fails midway (F3)",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        { documents, documentFiles, documentMetadata, documentSmartTags, smartTags },
        { DrizzleDocumentProcessingRepository },
        { processDocumentJob },
      ] = await Promise.all([
        import("@axentra/db"),
        import("../apps/worker/src/processors/document.processor.repository"),
        import("../apps/worker/src/processors/document.processor"),
      ]);

      const suffix = crypto.randomUUID().slice(0, 8);
      const failDocId = crypto.randomUUID();
      const failFileId = crypto.randomUUID();
      const validKey = `integration-tests/${failDocId}/test.pdf`;
      const dummyPdf = Buffer.from(
        "%PDF-1.4\n1 0 obj\n<< /Length 20 >>\nstream\n(budget) Tj\nendstream\nendobj\n%%EOF",
        "latin1",
      );

      const storageMap = new Map<string, Uint8Array>();
      storageMap.set(validKey, dummyPdf);

      const storage: StorageAdapter = {
        async getObject(key: string) {
          const item = storageMap.get(key);
          if (!item) throw new Error(`Not found: ${key}`);
          return item;
        },
        async putObject(input) {
          storageMap.set(input.key, input.body);
          return { key: input.key, etag: "mock" };
        },
        async deleteObject(key: string) {
          storageMap.delete(key);
        },
        async headObject() {
          return null;
        },
        async initialize() {},
        async getDownloadUrl(key: string) {
          return `http://localhost:9000/documents/${key}`;
        },
      };

      // Repository subclass that begins active transaction, performs writes, then injects write failure midway
      class TransactionFailureProcessingRepository extends DrizzleDocumentProcessingRepository {
        public override async completeWithMetadata(
          documentId: string,
          metadata: {
            author: string | null;
            rawMetadata: Record<string, unknown>;
            extractedAt: Date;
          },
        ): Promise<void> {
          const now = new Date();
          await this.db.transaction(async (tx) => {
            // Write 1: insert document metadata inside the active transaction
            await tx
              .insert(documentMetadata)
              .values({
                documentId,
                author: metadata.author,
                rawMetadata: metadata.rawMetadata,
                extractedAt: metadata.extractedAt,
                updatedAt: now,
              })
              .onConflictDoUpdate({
                target: documentMetadata.documentId,
                set: {
                  author: metadata.author,
                  rawMetadata: metadata.rawMetadata,
                  extractedAt: metadata.extractedAt,
                  updatedAt: now,
                },
              });

            // Write 2: insert tag inside the active transaction
            await tx
              .insert(smartTags)
              .values({ name: `rollback-test-tag-${suffix}` })
              .onConflictDoNothing();

            // Simulate database write failure AFTER writes have executed inside this active transaction
            throw new Error(
              "Simulated database write failure midway inside completeWithMetadata transaction",
            );
          });
        }
      }

      const failingRepo = new TransactionFailureProcessingRepository(database.db);

      try {
        // 1. Insert document in queued state
        await database.db.insert(documents).values({
          id: failDocId,
          title: `Rollback Doc ${suffix}`,
          processingStatus: "queued",
        });

        // 2. Insert document file
        await database.db.insert(documentFiles).values({
          id: failFileId,
          documentId: failDocId,
          storageKey: validKey,
          originalName: "rollback.pdf",
          mimeType: "application/pdf",
          fileSize: dummyPdf.length,
          fileExtension: "pdf",
        });

        // 3. Process document - expected to fail due to simulated write error during transaction
        let caughtError: unknown;
        try {
          await processDocumentJob(
            {
              jobId: `job-fail-${suffix}`,
              documentId: failDocId,
              schemaVersion: 1,
              enqueuedAt: new Date().toISOString(),
            },
            {
              repository: failingRepo,
              storage,
            },
          );
        } catch (err) {
          caughtError = err;
        }

        expect(caughtError).toBeDefined();

        // 4. Verify document status marked as failed in PostgreSQL
        const [failedDoc] = await database.db
          .select()
          .from(documents)
          .where(inArray(documents.id, [failDocId]));
        expect(failedDoc?.processingStatus).toBe("failed");
        expect(failedDoc?.errorMessage).toContain(
          "Simulated database write failure midway inside completeWithMetadata transaction",
        );

        // 5. PROVE TRANSACTION ROLLBACK: document_metadata write MUST be rolled back!
        const rolledBackMetadata = await database.db
          .select()
          .from(documentMetadata)
          .where(inArray(documentMetadata.documentId, [failDocId]));
        expect(rolledBackMetadata.length).toBe(0);

        // 6. PROVE TRANSACTION ROLLBACK: no document_smart_tags links exist!
        const rolledBackTags = await database.db
          .select()
          .from(documentSmartTags)
          .where(inArray(documentSmartTags.documentId, [failDocId]));
        expect(rolledBackTags.length).toBe(0);
      } finally {
        await database.db.delete(documentFiles).where(inArray(documentFiles.id, [failFileId]));
        await database.db
          .delete(documentSmartTags)
          .where(inArray(documentSmartTags.documentId, [failDocId]));
        await database.db
          .delete(documentMetadata)
          .where(inArray(documentMetadata.documentId, [failDocId]));
        await database.db.delete(documents).where(inArray(documents.id, [failDocId]));
      }
    },
  );

  integrationTest(
    "soft-deleted document returns 404 on GET /api/v1/documents/:id/smart-tags",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        { documents, documentSmartTags, smartTags },
        { DrizzleDocumentSmartTagsRepository },
        { createApp },
        { createDocumentService },
        { createLogger },
      ] = await Promise.all([
        import("@axentra/db"),
        import("../apps/api/src/modules/documents/smart-tags.repository"),
        import("../apps/api/src/app"),
        import("../apps/api/src/modules/documents/documents.service"),
        import("@axentra/observability"),
      ]);

      const suffix = crypto.randomUUID().slice(0, 8);
      const deletedDocId = crypto.randomUUID();
      const tagId = crypto.randomUUID();

      const apiSmartTagsRepo = new DrizzleDocumentSmartTagsRepository(database.db);
      const documentService = createDocumentService({
        smartTagsRepository: apiSmartTagsRepo,
      });

      const tokenVerifier = {
        async verifyToken(token: string) {
          if (token === "integration-member-token") {
            return {
              userId: "user-1",
              email: "member@axentra.local",
              role: "member_team" as const,
              name: "Integration Member",
            };
          }
          return null;
        },
      };

      const logger = createLogger({
        service: "axentra-api-test",
        environment: "test",
        version: "0.1.0",
        level: "fatal",
      });

      const app = createApp({
        logger,
        version: "0.1.0",
        readinessChecks: [],
        tokenVerifier,
        documentService,
      });

      try {
        // Insert soft-deleted document
        await database.db.insert(documents).values({
          id: deletedDocId,
          title: `Deleted Doc ${suffix}`,
          processingStatus: "completed",
          deletedAt: new Date(),
        });

        // Insert smart tag & link
        await database.db.insert(smartTags).values({
          id: tagId,
          name: `finance-${suffix}`,
        });
        await database.db.insert(documentSmartTags).values({
          documentId: deletedDocId,
          tagId,
        });

        // Fetch through HTTP route
        const response = await app.request(`/api/v1/documents/${deletedDocId}/smart-tags`, {
          method: "GET",
          headers: {
            authorization: "Bearer integration-member-token",
          },
        });

        expect(response.status).toBe(404);
        const body = (await response.json()) as { success: boolean; error: { code: string } };
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("NOT_FOUND");
      } finally {
        await database.db
          .delete(documentSmartTags)
          .where(inArray(documentSmartTags.documentId, [deletedDocId]));
        await database.db.delete(smartTags).where(inArray(smartTags.id, [tagId]));
        await database.db.delete(documents).where(inArray(documents.id, [deletedDocId]));
      }
    },
  );
});
