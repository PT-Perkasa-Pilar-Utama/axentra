import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import type { DatabaseClient, closeDatabase as CloseDatabase } from "@axentra/db";
import type { Worker } from "bullmq";
import type { QueueProducer, RedisProbe } from "@axentra/queue";
import type { StorageAdapter } from "@axentra/storage";
import type {
  ApiSuccessEnvelope,
  CategorySummary,
  DocumentCategoryResponse,
  DocumentProcessingJob,
} from "@axentra/shared";
import { uploadDocumentSuccessResponseSchema } from "@axentra/shared";
import type { createApp as CreateApp } from "../apps/api/src/app";
import type { closeWorkerWithinDeadline as CloseWorkerWithinDeadline } from "../apps/worker/src/lifecycle";
import type { DrizzleDocumentProcessingRepository as DrizzleWorkerRepo } from "../apps/worker/src/processors/document.processor.repository";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? test : test.skip;

describe("Auto-Category Assignment Real Queue & Storage Integration (Task BE-S2-04 / AC-05.01 & AC-05.02 / F4)", () => {
  let database: DatabaseClient | undefined;
  let redis: RedisProbe | undefined;
  let storage: StorageAdapter | undefined;
  let producer: QueueProducer | undefined;
  let worker: Worker | undefined;
  let workerRepo: DrizzleWorkerRepo | undefined;
  let app: ReturnType<CreateApp> | undefined;
  let closeDatabase: CloseDatabase;
  let closeWorkerWithinDeadline: CloseWorkerWithinDeadline;

  const createdDocumentIds: string[] = [];
  const createdStorageKeys: string[] = [];
  const createdCategoryIds: string[] = [];
  let preExistingCategoryIds = new Set<string>();
  let databaseUrl = "";

  const pendingJobResolvers = new Map<string, () => void>();
  type JobProcessingHook = (payload: DocumentProcessingJob) => Promise<boolean | void>;
  let beforeProcessingHook: JobProcessingHook | undefined;

  beforeAll(async () => {
    if (!runIntegrationTests) return;

    const [
      { loadApiConfigFromRuntime },
      db,
      queue,
      storageAdapter,
      observability,
      api,
      lifecycle,
      docProcessor,
      workerRepository,
      docRepo,
      dupRepo,
      docCategoryRepo,
      catRepo,
      docService,
      catService,
      { assertDisposableTestDatabase },
      { ensureTestDatabaseReady },
    ] = await Promise.all([
      import("@axentra/config"),
      import("@axentra/db"),
      import("@axentra/queue"),
      import("@axentra/storage"),
      import("@axentra/observability"),
      import("../apps/api/src/app"),
      import("../apps/worker/src/lifecycle"),
      import("../apps/worker/src/processors/document.processor"),
      import("../apps/worker/src/processors/document.processor.repository"),
      import("../apps/api/src/modules/documents/documents.repository"),
      import("../apps/api/src/modules/documents/duplicate.repository"),
      import("../apps/api/src/modules/documents/category.repository"),
      import("../apps/api/src/modules/categories/categories.repository"),
      import("../apps/api/src/modules/documents/documents.service"),
      import("../apps/api/src/modules/categories/categories.service"),
      import("./helpers/disposable-database"),
      import("../infra/local/prepare-test-db"),
    ]);

    closeDatabase = db.closeDatabase;
    closeWorkerWithinDeadline = lifecycle.closeWorkerWithinDeadline;

    const config = loadApiConfigFromRuntime();
    databaseUrl =
      Bun.env.TEST_DATABASE_URL ??
      Bun.env.DATABASE_URL ??
      "postgres://axentra:local-postgres-password@localhost:5432/axentra_test";

    // F1 & F5: Strict disposable test database validation & idempotent provisioning
    assertDisposableTestDatabase(databaseUrl);

    database = db.createDatabaseClient(databaseUrl);
    try {
      await db.checkDatabase(database);
    } catch {
      await ensureTestDatabaseReady(databaseUrl);
      await db.checkDatabase(database);
    }

    redis = queue.createRedisProbe(config.REDIS_URL, config.REDIS_HEALTH_TIMEOUT_MS);
    storage = storageAdapter.createS3StorageAdapter(config);

    await Promise.all([redis.checkHealth(), storage.initialize()]);

    // Snapshot pre-existing categories for exclusion guard (F1)
    const preExisting = await database.db.select({ id: db.categories.id }).from(db.categories);
    preExistingCategoryIds = new Set(preExisting.map((c) => c.id));

    // Isolated test queue
    const queueName = `axentra-auto-category-${crypto.randomUUID()}`;
    producer = queue.createQueueProducer(queueName, config.REDIS_URL);

    // Real BullMQ worker wired to real MinIO storage & PostgreSQL (F4)
    workerRepo = new workerRepository.DrizzleDocumentProcessingRepository(database.db);
    const workerLogger = observability.createLogger({
      service: "axentra-worker-test",
      environment: "test",
      version: "0.1.0",
      level: "fatal",
    });

    const handleDocumentProcessing = async (payload: DocumentProcessingJob): Promise<void> => {
      if (workerRepo === undefined || storage === undefined) return;
      const jobScopedLogger = observability.jobLogger(workerLogger, payload.jobId);
      try {
        if (beforeProcessingHook) {
          const handled = await beforeProcessingHook(payload);
          if (handled) return;
        }

        await docProcessor.processDocumentJob(payload, {
          repository: workerRepo,
          storage,
          logger: jobScopedLogger,
        });
      } finally {
        for (const id of workerRepo.createdCategoryIds) {
          if (!createdCategoryIds.includes(id)) {
            createdCategoryIds.push(id);
          }
        }

        const resolver = pendingJobResolvers.get(payload.documentId);
        if (resolver) {
          resolver();
        }
      }
    };

    // Concurrency 2 matches production worker configuration (F12)
    worker = queue.createQueueWorker(queueName, config.REDIS_URL, 2, {
      handleSystemHealthCheck: async () => undefined,
      handleDocumentProcessing,
    });
    await worker.waitUntilReady();

    const integrationTokenVerifier = {
      verifyToken(token: string) {
        if (token === "integration-member-token") {
          return {
            id: "11111111-1111-4111-8111-111111111111",
            email: "member@axentra.local",
            role: "member_team" as const,
            name: "Integration Member",
          };
        }
        return null;
      },
    };

    const apiLogger = observability.createLogger({
      service: "axentra-api-test",
      environment: "test",
      version: "0.1.0",
      level: "fatal",
    });

    const documentService = docService.createDocumentService({
      repository: new docRepo.DocumentRepository(database.db),
      storage,
      queue: producer,
      contentHashRepository: new dupRepo.DrizzleDocumentContentHashRepository(database.db),
      categoryRepository: new docCategoryRepo.DrizzleDocumentCategoryRepository(database.db),
      logger: apiLogger,
    });

    const categoriesService = catService.createCategoriesService(
      new catRepo.DrizzleCategoriesRepository(database.db),
    );

    app = api.createApp({
      logger: apiLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier: integrationTokenVerifier,
      documentService,
      categoriesService,
      enableUploadRoute: true,
    });
  }, 30000);

  afterAll(async () => {
    if (worker !== undefined) await closeWorkerWithinDeadline(worker, 2000);
    if (producer !== undefined) await producer.close();
    if (redis !== undefined) await redis.close();

    if (storage !== undefined) {
      for (const key of createdStorageKeys) {
        try {
          await storage.deleteObject(key);
        } catch {
          // Report sanitized cleanup failure without disclosing storage object key or raw vendor error (F11)
          console.warn("[test-cleanup] Failed to delete test storage object during teardown");
        }
      }
      await storage.close();
    }

    if (database !== undefined) {
      const { documents, documentFiles, documentContentHashes } = await import("@axentra/db");
      const { safeCleanupTestCategories } = await import("./helpers/disposable-database");

      if (createdDocumentIds.length > 0) {
        await database.db
          .delete(documentContentHashes)
          .where(inArray(documentContentHashes.documentId, createdDocumentIds));
        await database.db
          .delete(documentFiles)
          .where(inArray(documentFiles.documentId, createdDocumentIds));
        await database.db.delete(documents).where(inArray(documents.id, createdDocumentIds));
      }

      await safeCleanupTestCategories(database, createdCategoryIds, {
        preExistingCategoryIds,
        databaseUrl,
      });

      await closeDatabase(database);
    }
  }, 30000);

  async function uploadPdfDocument(
    filename: string,
    content: string,
  ): Promise<{ docId: string; storageKey: string }> {
    if (app === undefined || database === undefined) {
      throw new Error("Integration app was not initialized");
    }
    const { documentFiles, documentContentHashes } = await import("@axentra/db");

    const pdfBytes = new TextEncoder().encode(content);
    const expectedHash = crypto.createHash("sha256").update(pdfBytes).digest("hex");

    const formData = new FormData();
    formData.append("file", new File([pdfBytes], filename, { type: "application/pdf" }));

    const response = await app.request("/api/v1/documents/upload", {
      method: "POST",
      headers: { authorization: "Bearer integration-member-token" },
      body: formData,
    });

    expect(response.status).toBe(200);
    const body = uploadDocumentSuccessResponseSchema.parse(await response.json());
    expect(body.success).toBe(true);

    const hashRows = await database.db
      .select()
      .from(documentContentHashes)
      .where(eq(documentContentHashes.contentHash, expectedHash))
      .limit(1);

    const docId = hashRows[0]?.documentId;
    if (!docId) throw new Error("Document ID not found in database after upload");

    const fileRows = await database.db
      .select()
      .from(documentFiles)
      .where(eq(documentFiles.documentId, docId))
      .limit(1);

    const storageKey = fileRows[0]?.storageKey;
    if (!storageKey) throw new Error("Storage key not found in database after upload");

    createdDocumentIds.push(docId);
    createdStorageKeys.push(storageKey);

    return { docId, storageKey };
  }

  async function waitForDocumentProcessing(docId: string, timeoutMs = 15000): Promise<void> {
    if (database === undefined) throw new Error("Database not initialized");
    const { documents } = await import("@axentra/db");

    const startTime = Date.now();

    return new Promise<void>((resolve, reject) => {
      let isSettled = false;
      let intervalTimer: ReturnType<typeof setInterval> | null = null;
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        isSettled = true;
        if (intervalTimer) clearInterval(intervalTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        pendingJobResolvers.delete(docId);
      };

      const checkTerminalStatus = async () => {
        if (isSettled || database === undefined) return;
        try {
          const [doc] = await database.db
            .select({
              status: documents.processingStatus,
              errorMessage: documents.errorMessage,
            })
            .from(documents)
            .where(eq(documents.id, docId))
            .limit(1);

          if (!doc || isSettled) return;

          if (doc.status === "completed") {
            cleanup();
            resolve();
            return;
          }

          // Check BullMQ queue job state to distinguish retryable attempts from exhausted failures (F13)
          if (producer?.getJobState) {
            const jobState = await producer.getJobState(docId);
            if (jobState) {
              if (jobState.state === "completed") {
                cleanup();
                resolve();
                return;
              }

              if (jobState.state !== "failed" && jobState.attemptsMade < jobState.maxAttempts) {
                // BullMQ retry is still pending or delayed; keep waiting for subsequent attempt (F13)
                return;
              }

              if (jobState.state === "failed" || jobState.attemptsMade >= jobState.maxAttempts) {
                cleanup();
                reject(
                  new Error(
                    `Document processing failed for ${docId}: ${
                      doc.errorMessage ?? jobState.failedReason ?? "retries exhausted"
                    }`,
                  ),
                );
                return;
              }
            }
          }

          if (doc.status === "failed") {
            cleanup();
            reject(
              new Error(
                `Document processing failed for ${docId}: ${doc.errorMessage ?? "unknown failure"}`,
              ),
            );
            return;
          }
        } catch (err) {
          if (!isSettled) {
            cleanup();
            reject(err);
          }
        }
      };

      // Register the worker notification callback first so completion is not missed (F9)
      pendingJobResolvers.set(docId, () => {
        void checkTerminalStatus();
      });

      // Poll periodically to catch any state already committed or missed (F9)
      intervalTimer = setInterval(() => {
        if (Date.now() - startTime > timeoutMs) {
          cleanup();
          reject(new Error(`Timed out waiting for worker processing of document ${docId}`));
          return;
        }
        void checkTerminalStatus();
      }, 100);

      // Timeout fallback
      timeoutTimer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for worker processing of document ${docId}`));
      }, timeoutMs);

      // Check immediately in case document already completed before waiter registered (F9)
      void checkTerminalStatus();
    });
  }

  integrationTest(
    "AC-05.01: end-to-end API upload -> queue -> worker (MinIO read) -> assigns Reporting category with inactive permission (F4)",
    async () => {
      if (database === undefined || storage === undefined || app === undefined) {
        throw new Error("Integration infrastructure not initialized");
      }
      const { documents, categories, categoryDownloadPermissions } = await import("@axentra/db");

      // Neutral filename that cannot trigger filename fallback (F2)
      const neutralFilename = "doc-content-sample-a.pdf";
      const pdfContent = `%PDF-1.4
% run-${crypto.randomUUID()}
1 0 obj
<< /Author (Finance Lead) >>
endobj
2 0 obj
<< /Length 120 >>
stream
BT
/F1 12 Tf
(Dokumen ini berisi Reporting tahunan organisasi dan data rekapitulasi Reporting.) Tj
ET
endstream
endobj
%%EOF`;

      // 1. Upload through authenticated API
      const { docId, storageKey } = await uploadPdfDocument(neutralFilename, pdfContent);

      // Verify object exists in real MinIO storage
      const storedBytes = await storage.getObject(storageKey);
      expect(storedBytes.length).toBeGreaterThan(0);

      // 2. Consume job through real BullMQ queue worker
      await waitForDocumentProcessing(docId);

      // 3. Verify PostgreSQL persistence
      const [doc] = await database.db
        .select()
        .from(documents)
        .where(eq(documents.id, docId))
        .limit(1);

      expect(doc?.processingStatus).toBe("completed");
      expect(doc?.categoryId).not.toBeNull();

      const [categoryRow] = await database.db
        .select()
        .from(categories)
        .where(eq(categories.id, doc?.categoryId ?? ""))
        .limit(1);

      expect(categoryRow?.name).toBe("Reporting");
      expect(categoryRow?.slug).toBe("reporting");

      // Verify category download permission is inactive by default (false)
      const [permissionRow] = await database.db
        .select()
        .from(categoryDownloadPermissions)
        .where(eq(categoryDownloadPermissions.categoryId, categoryRow?.id ?? ""))
        .limit(1);

      expect(permissionRow).toBeDefined();
      expect(permissionRow?.downloadEnabled).toBe(false);

      // 4. Verify API response shapes match shared schema (F3)
      // GET /api/v1/documents/:id/category
      const docCatRes = await app.request(`/api/v1/documents/${docId}/category`, {
        method: "GET",
        headers: { authorization: "Bearer integration-member-token" },
      });
      expect(docCatRes.status).toBe(200);
      const docCatBody = (await docCatRes.json()) as DocumentCategoryResponse;
      expect(docCatBody.success).toBe(true);
      expect(docCatBody.data?.name).toBe("Reporting");
      expect(docCatBody.data?.slug).toBe("reporting");
      expect(docCatBody.data?.downloadEnabled).toBe(false);

      // GET /api/v1/categories
      const catListRes = await app.request("/api/v1/categories", {
        method: "GET",
        headers: { authorization: "Bearer integration-member-token" },
      });
      expect(catListRes.status).toBe(200);
      const catListBody = (await catListRes.json()) as ApiSuccessEnvelope<
        ReadonlyArray<CategorySummary>
      >;
      expect(catListBody.success).toBe(true);
      const reportingInList = catListBody.data.find((c) => c.slug === "reporting");
      expect(reportingInList).toBeDefined();
      expect(reportingInList?.downloadEnabled).toBe(false);
    },
  );

  integrationTest(
    "AC-05.02: end-to-end API upload & worker processing assigns distinct categories for Reporting and Contract documents (F4)",
    async () => {
      if (database === undefined || app === undefined) {
        throw new Error("Integration infrastructure not initialized");
      }
      const { documents, categories } = await import("@axentra/db");

      const neutralReportingFilename = "doc-content-sample-b.pdf";
      const neutralContractFilename = "doc-content-sample-c.pdf";

      const reportingPdf = `%PDF-1.4
% run-${crypto.randomUUID()}
1 0 obj
<< /Author (Finance Lead) >>
endobj
2 0 obj
<< /Length 120 >>
stream
BT
/F1 12 Tf
(Dokumen ini menyajikan data Reporting operasional dan Reporting kinerja kuartal.) Tj
ET
endstream
endobj
%%EOF`;

      const contractPdf = `%PDF-1.4
% run-${crypto.randomUUID()}
1 0 obj
<< /Author (Legal Lead) >>
endobj
2 0 obj
<< /Length 120 >>
stream
BT
/F1 12 Tf
(Dokumen resmi Contract pengadaan dan kesepakatan Contract kerja sama antar pihak.) Tj
ET
endstream
endobj
%%EOF`;

      // 1. Upload both documents via authenticated API
      const { docId: reportingDocId } = await uploadPdfDocument(
        neutralReportingFilename,
        reportingPdf,
      );
      const { docId: contractDocId } = await uploadPdfDocument(
        neutralContractFilename,
        contractPdf,
      );

      // 2. Consume both jobs via BullMQ worker
      await Promise.all([
        waitForDocumentProcessing(reportingDocId),
        waitForDocumentProcessing(contractDocId),
      ]);

      // 3. Verify distinct categories assigned in database
      const [reportingDoc] = await database.db
        .select()
        .from(documents)
        .where(eq(documents.id, reportingDocId))
        .limit(1);

      const [contractDoc] = await database.db
        .select()
        .from(documents)
        .where(eq(documents.id, contractDocId))
        .limit(1);

      expect(reportingDoc?.categoryId).not.toBeNull();
      expect(contractDoc?.categoryId).not.toBeNull();
      expect(reportingDoc?.categoryId).not.toBe(contractDoc?.categoryId);

      const [reportingCategory] = await database.db
        .select()
        .from(categories)
        .where(eq(categories.id, reportingDoc?.categoryId ?? ""))
        .limit(1);
      const [contractCategory] = await database.db
        .select()
        .from(categories)
        .where(eq(categories.id, contractDoc?.categoryId ?? ""))
        .limit(1);

      expect(reportingCategory?.name).toBe("Reporting");
      expect(contractCategory?.name).toBe("Contract");

      // 4. Verify API category responses for both documents
      const resReporting = await app.request(`/api/v1/documents/${reportingDocId}/category`, {
        method: "GET",
        headers: { authorization: "Bearer integration-member-token" },
      });
      expect(resReporting.status).toBe(200);
      const bodyReporting = (await resReporting.json()) as DocumentCategoryResponse;
      expect(bodyReporting.success).toBe(true);
      expect(bodyReporting.data?.name).toBe("Reporting");
      expect(bodyReporting.data?.slug).toBe("reporting");
      expect(bodyReporting.data?.downloadEnabled).toBe(false);

      const resContract = await app.request(`/api/v1/documents/${contractDocId}/category`, {
        method: "GET",
        headers: { authorization: "Bearer integration-member-token" },
      });
      expect(resContract.status).toBe(200);
      const bodyContract = (await resContract.json()) as DocumentCategoryResponse;
      expect(bodyContract.success).toBe(true);
      expect(bodyContract.data?.name).toBe("Contract");
      expect(bodyContract.data?.slug).toBe("contract");
      expect(bodyContract.data?.downloadEnabled).toBe(false);
    },
  );

  integrationTest(
    "regression (F1): categories created externally after setup are reused by queue worker and never deleted by cleanup",
    async () => {
      if (database === undefined || workerRepo === undefined) {
        throw new Error("Integration infrastructure not initialized");
      }
      const { categories, categoryDownloadPermissions, documents } = await import("@axentra/db");
      const { safeCleanupTestCategories } = await import("./helpers/disposable-database");

      const externalCategoryId = crypto.randomUUID();
      const externalCategoryName = "Finance";
      const externalCategorySlug = "finance";

      // 1. Insert external category created after snapshot
      await database.db.insert(categories).values({
        id: externalCategoryId,
        name: externalCategoryName,
        slug: externalCategorySlug,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await database.db.insert(categoryDownloadPermissions).values({
        categoryId: externalCategoryId,
        downloadEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(preExistingCategoryIds.has(externalCategoryId)).toBe(false);

      const neutralFilename = "doc-finance-audit-record.pdf";
      const pdfContent = `%PDF-1.4
% run-${crypto.randomUUID()}
1 0 obj
<< /Author (Corporate Treasurer) >>
endobj
2 0 obj
<< /Length 120 >>
stream
BT
/F1 12 Tf
(Dokumen ini memuat laporan finance dan keuangan operasional triwulan.) Tj
ET
endstream
endobj
%%EOF`;

      try {
        // 2. Upload through real API and consume through BullMQ worker
        const { docId: regDocId } = await uploadPdfDocument(neutralFilename, pdfContent);
        await waitForDocumentProcessing(regDocId);

        // 3. Verify worker reused the external category
        const [processedDoc] = await database.db
          .select()
          .from(documents)
          .where(eq(documents.id, regDocId))
          .limit(1);

        expect(processedDoc?.processingStatus).toBe("completed");
        expect(processedDoc?.categoryId).toBe(externalCategoryId);

        // Worker repository tracks ONLY categories actually inserted by this worker run.
        expect(workerRepo.createdCategoryIds).not.toContain(externalCategoryId);

        // 4. Execute multi-layer safe cleanup with tracked created categories
        const cleanupResult = await safeCleanupTestCategories(
          database,
          workerRepo.createdCategoryIds,
          { preExistingCategoryIds, databaseUrl },
        );

        // Verify the external category was never considered or deleted
        expect(cleanupResult.deletedCategoryIds).not.toContain(externalCategoryId);

        // Verify the external category remains intact in the database with original name & permission
        const [stillExists] = await database.db
          .select({ id: categories.id, name: categories.name })
          .from(categories)
          .where(eq(categories.id, externalCategoryId))
          .limit(1);

        expect(stillExists).toBeDefined();
        expect(stillExists?.id).toBe(externalCategoryId);
        expect(stillExists?.name).toBe(externalCategoryName);

        const [permStillExists] = await database.db
          .select({
            id: categoryDownloadPermissions.id,
            downloadEnabled: categoryDownloadPermissions.downloadEnabled,
          })
          .from(categoryDownloadPermissions)
          .where(eq(categoryDownloadPermissions.categoryId, externalCategoryId))
          .limit(1);

        expect(permStillExists).toBeDefined();
        expect(permStillExists?.downloadEnabled).toBe(true);
      } finally {
        await database.db
          .delete(categoryDownloadPermissions)
          .where(eq(categoryDownloadPermissions.categoryId, externalCategoryId));
        await database.db.delete(categories).where(eq(categories.id, externalCategoryId));
      }
    },
  );

  integrationTest(
    "regression (F1): category created by test worker is preserved if another document references it",
    async () => {
      if (database === undefined) {
        throw new Error("Integration infrastructure not initialized");
      }
      const { categories, categoryDownloadPermissions, documents } = await import("@axentra/db");
      const { safeCleanupTestCategories } = await import("./helpers/disposable-database");

      const testCatId = crypto.randomUUID();
      const foreignDocId = crypto.randomUUID();

      await database.db.insert(categories).values({
        id: testCatId,
        name: "Temporary Shared Test Cat",
        slug: `temp-shared-${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await database.db.insert(categoryDownloadPermissions).values({
        categoryId: testCatId,
        downloadEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await database.db.insert(documents).values({
        id: foreignDocId,
        title: "Foreign Document",
        fileType: "application/pdf",
        fileSize: 1024,
        storageKey: `foreign/${foreignDocId}.pdf`,
        processingStatus: "completed",
        categoryId: testCatId,
        uploadedBy: "foreign-user",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      try {
        const cleanupResult = await safeCleanupTestCategories(database, [testCatId], {
          preExistingCategoryIds,
          databaseUrl,
        });

        expect(cleanupResult.skippedCategoryIds).toContain(testCatId);
        expect(cleanupResult.deletedCategoryIds).not.toContain(testCatId);

        const [stillExists] = await database.db
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, testCatId))
          .limit(1);

        expect(stillExists).toBeDefined();
        expect(stillExists?.id).toBe(testCatId);
      } finally {
        await database.db.delete(documents).where(eq(documents.id, foreignDocId));
        await database.db
          .delete(categoryDownloadPermissions)
          .where(eq(categoryDownloadPermissions.categoryId, testCatId));
        await database.db.delete(categories).where(eq(categories.id, testCatId));
      }
    },
  );

  integrationTest(
    "F12 concurrency: concurrent worker processing for the same absent category completes both documents without unique constraint collision",
    async () => {
      if (database === undefined || storage === undefined || app === undefined) {
        throw new Error("Integration infrastructure not initialized");
      }
      const { documents, categories, categoryDownloadPermissions } = await import("@axentra/db");

      // Ensure the target category does not exist before test (F12)
      const existingFinance = await database.db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, "finance"));
      if (existingFinance.length > 0) {
        await database.db.delete(categoryDownloadPermissions).where(
          inArray(
            categoryDownloadPermissions.categoryId,
            existingFinance.map((c) => c.id),
          ),
        );
        await database.db.delete(categories).where(eq(categories.slug, "finance"));
      }

      const pdfFinanceA = `%PDF-1.4
% run-${crypto.randomUUID()}
1 0 obj
<< /Author (Finance Lead) >>
endobj
2 0 obj
<< /Length 120 >>
stream
BT
/F1 12 Tf
72 712 Td
(Laporan keuangan kuartal satu kas perseroan financial summary) Tj
ET
endstream
endobj
xref
0 3
0000000000 65535 f 
0000000010 00000 n 
0000000067 00000 n 
trailer
<< /Size 3 /Root 1 0 R >>
startxref
240
%%EOF`;

      const pdfFinanceB = `%PDF-1.4
% run-${crypto.randomUUID()}
1 0 obj
<< /Author (Finance Auditor) >>
endobj
2 0 obj
<< /Length 120 >>
stream
BT
/F1 12 Tf
72 712 Td
(Ringkasan arus kas keuangan operasional dan financial ledger) Tj
ET
endstream
endobj
xref
0 3
0000000000 65535 f 
0000000010 00000 n 
0000000067 00000 n 
trailer
<< /Size 3 /Root 1 0 R >>
startxref
240
%%EOF`;

      // Upload both documents concurrently
      const [doc1, doc2] = await Promise.all([
        uploadPdfDocument("doc-concurrent-finance-a.pdf", pdfFinanceA),
        uploadPdfDocument("doc-concurrent-finance-b.pdf", pdfFinanceB),
      ]);

      // Wait for both documents to finish processing
      await Promise.all([
        waitForDocumentProcessing(doc1.docId),
        waitForDocumentProcessing(doc2.docId),
      ]);

      const [row1] = await database.db
        .select({
          status: documents.processingStatus,
          categoryId: documents.categoryId,
          errorMessage: documents.errorMessage,
        })
        .from(documents)
        .where(eq(documents.id, doc1.docId))
        .limit(1);

      const [row2] = await database.db
        .select({
          status: documents.processingStatus,
          categoryId: documents.categoryId,
          errorMessage: documents.errorMessage,
        })
        .from(documents)
        .where(eq(documents.id, doc2.docId))
        .limit(1);

      expect(row1?.status).toBe("completed");
      expect(row2?.status).toBe("completed");
      expect(row1?.errorMessage).toBeNull();
      expect(row2?.errorMessage).toBeNull();

      // Both documents must be assigned the same category ID
      expect(row1?.categoryId).toBeDefined();
      expect(row2?.categoryId).toBeDefined();
      expect(row1?.categoryId).toBe(row2?.categoryId);

      // Verify category record in DB
      const financeCategories = await database.db
        .select()
        .from(categories)
        .where(eq(categories.slug, "finance"));
      expect(financeCategories.length).toBe(1);
      expect(financeCategories[0]?.name).toBe("Finance");
      const financeCatId = financeCategories[0]?.id;
      expect(financeCatId).toBeDefined();
      if (!financeCatId) throw new Error("Finance category was not created");
      if (!createdCategoryIds.includes(financeCatId)) {
        createdCategoryIds.push(financeCatId);
      }

      // Verify category permission is inactive
      const [permission] = await database.db
        .select()
        .from(categoryDownloadPermissions)
        .where(eq(categoryDownloadPermissions.categoryId, financeCatId))
        .limit(1);
      expect(permission).toBeDefined();
      expect(permission?.downloadEnabled).toBe(false);
    },
  );

  integrationTest(
    "F13 retryable failure: waiter does not reject on transient first-attempt failure and completes on BullMQ retry",
    async () => {
      if (database === undefined || storage === undefined || app === undefined) {
        throw new Error("Integration infrastructure not initialized");
      }
      const { documents, categories } = await import("@axentra/db");

      const pdfLegal = `%PDF-1.4
% run-${crypto.randomUUID()}
1 0 obj
<< /Author (Legal Counsel) >>
endobj
2 0 obj
<< /Length 120 >>
stream
BT
/F1 12 Tf
72 712 Td
(Dokumen regulasi legal hukum dan kepatuhan perusahaan) Tj
ET
endstream
endobj
xref
0 3
0000000000 65535 f 
0000000010 00000 n 
0000000067 00000 n 
trailer
<< /Size 3 /Root 1 0 R >>
startxref
240
%%EOF`;

      let attemptCount = 0;

      beforeProcessingHook = async (payload) => {
        attemptCount++;
        if (attemptCount === 1) {
          // First attempt throws transient failure
          if (workerRepo) {
            await workerRepo.markAsFailed(
              payload.documentId,
              "Transient database connectivity timeout",
            );
          }
          throw new Error("Transient database connectivity timeout");
        }
      };

      try {
        const doc = await uploadPdfDocument("doc-transient-retry.pdf", pdfLegal);

        // Wait for document processing through retry
        await waitForDocumentProcessing(doc.docId, 15000);

        expect(attemptCount).toBeGreaterThanOrEqual(2);

        const [finalRow] = await database.db
          .select({
            status: documents.processingStatus,
            categoryId: documents.categoryId,
            errorMessage: documents.errorMessage,
          })
          .from(documents)
          .where(eq(documents.id, doc.docId))
          .limit(1);

        expect(finalRow?.status).toBe("completed");
        expect(finalRow?.errorMessage).toBeNull();
        expect(finalRow?.categoryId).toBeDefined();

        if (finalRow?.categoryId) {
          const [cat] = await database.db
            .select()
            .from(categories)
            .where(eq(categories.id, finalRow.categoryId))
            .limit(1);
          expect(cat?.name).toBe("Legal");
          if (cat?.id && !createdCategoryIds.includes(cat.id)) {
            createdCategoryIds.push(cat.id);
          }
        }
      } finally {
        beforeProcessingHook = undefined;
      }
    },
    20000,
  );

  integrationTest(
    "F13 exhausted retries: waiter rejects once BullMQ attempts are exhausted",
    async () => {
      if (database === undefined || storage === undefined || app === undefined) {
        throw new Error("Integration infrastructure not initialized");
      }
      const { documents } = await import("@axentra/db");

      const pdfFail = `%PDF-1.4
% run-${crypto.randomUUID()}
1 0 obj
<< /Author (Test Author) >>
endobj
2 0 obj
<< /Length 80 >>
stream
BT
/F1 12 Tf
72 712 Td
(Dokumen uji kegagalan permanen) Tj
ET
endstream
endobj
xref
0 3
0000000000 65535 f 
0000000010 00000 n 
0000000067 00000 n 
trailer
<< /Size 3 /Root 1 0 R >>
startxref
200
%%EOF`;

      beforeProcessingHook = async (payload) => {
        if (workerRepo) {
          await workerRepo.markAsFailed(
            payload.documentId,
            "Unrecoverable corrupt payload failure",
          );
        }
        throw new Error("Unrecoverable corrupt payload failure");
      };

      try {
        const doc = await uploadPdfDocument("doc-permanent-fail.pdf", pdfFail);

        await expect(waitForDocumentProcessing(doc.docId, 25000)).rejects.toThrow(
          "Unrecoverable corrupt payload failure",
        );

        const [finalRow] = await database.db
          .select({
            status: documents.processingStatus,
            errorMessage: documents.errorMessage,
          })
          .from(documents)
          .where(eq(documents.id, doc.docId))
          .limit(1);

        expect(finalRow?.status).toBe("failed");
        expect(finalRow?.errorMessage).toContain("Unrecoverable corrupt payload failure");
      } finally {
        beforeProcessingHook = undefined;
      }
    },
    30000,
  );
});
