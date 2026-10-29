import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import type {
  DatabaseClient,
  closeDatabase as CloseDatabase,
  createDatabaseClient as CreateDatabaseClient,
} from "@axentra/db";
import type { DocumentProcessingJob } from "@axentra/shared";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? test : test.skip;

describe("Processing recovery PostgreSQL integration (BE-S1-02 / stale processing re-queue)", () => {
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
    "re-queues only processing documents older than the threshold, keyed by document id",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        { documents, documentFiles },
        { DrizzleDocumentProcessingRepository },
        recovery,
        observability,
      ] = await Promise.all([
        import("@axentra/db"),
        import("../apps/worker/src/processors/document.processor.repository"),
        import("../apps/worker/src/processors/processing-recovery"),
        import("@axentra/observability"),
      ]);

      const testId = crypto.randomUUID();
      const staleId = crypto.randomUUID();
      const freshId = crypto.randomUUID();
      const longAgo = new Date(Date.now() - recovery.STALE_PROCESSING_THRESHOLD_MS - 60_000);

      try {
        await database.db.insert(documents).values([
          {
            id: staleId,
            title: `stuck-${testId}.pdf`,
            processingStatus: "processing",
            updatedAt: longAgo,
          },
          {
            id: freshId,
            title: `fresh-${testId}.pdf`,
            processingStatus: "processing",
            updatedAt: new Date(),
          },
        ]);
        await database.db.insert(documentFiles).values([
          {
            documentId: staleId,
            storageKey: `documents/${staleId}/stuck.pdf`,
            originalName: "stuck.pdf",
            mimeType: "application/pdf",
            fileSize: 12,
            fileExtension: "pdf",
          },
          {
            documentId: freshId,
            storageKey: `documents/${freshId}/fresh.pdf`,
            originalName: "fresh.pdf",
            mimeType: "application/pdf",
            fileSize: 12,
            fileExtension: "pdf",
          },
        ]);

        const enqueued: DocumentProcessingJob[] = [];
        await recovery.recoverFailedProcessingJobs({
          repository: new DrizzleDocumentProcessingRepository(database.db),
          queue: {
            reconcileDocumentProcessing: async (payload) => {
              enqueued.push(payload);
              return payload.jobId;
            },
          },
          logger: observability.createLogger({
            service: "axentra-worker",
            environment: "test",
            version: "0.1.0",
            level: "fatal",
          }),
        });

        const staleJob = enqueued.find((job) => job.documentId === staleId);
        expect(staleJob?.jobId).toBe(staleId);
        expect(enqueued.some((job) => job.documentId === freshId)).toBe(false);
      } finally {
        await database.db.delete(documents).where(inArray(documents.id, [staleId, freshId]));
      }
    },
  );
});
