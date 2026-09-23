import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type {
  checkDatabase as CheckDatabase,
  closeDatabase as CloseDatabase,
  createDatabaseClient as CreateDatabaseClient,
} from "@axentra/db";
import type { createLogger as CreateLogger } from "@axentra/observability";
import type {
  createQueueProducer as CreateQueueProducer,
  createRedisProbe as CreateRedisProbe,
  createSystemHealthWorker as CreateSystemHealthWorker,
} from "@axentra/queue";
import {
  apiErrorSchema,
  checkDuplicateSuccessResponseSchema,
  uploadDocumentSuccessResponseSchema,
  type SystemHealthCheckJob,
} from "@axentra/shared";
import type { createS3StorageAdapter as CreateS3StorageAdapter } from "@axentra/storage";
import type { DatabaseClient } from "@axentra/db";
import type { QueueProducer, RedisProbe } from "@axentra/queue";
import type { StorageAdapter } from "@axentra/storage";
import type { createApp as CreateApp } from "../apps/api/src/app";
import type { closeWorkerWithinDeadline as CloseWorkerWithinDeadline } from "../apps/worker/src/lifecycle";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? test : test.skip;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Integration assertion timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

describe("infrastructure integration", () => {
  let database: DatabaseClient | undefined;
  let redis: RedisProbe | undefined;
  let storage: StorageAdapter | undefined;
  const storageOps: Array<{ op: "put" | "delete"; key: string }> = [];
  let producer: QueueProducer | undefined;
  let worker: ReturnType<CreateSystemHealthWorker> | undefined;
  let onJobProcessed: ((payload: SystemHealthCheckJob) => void) | undefined;
  let app: ReturnType<CreateApp> | undefined;
  let closeDatabase: CloseDatabase;
  let checkDatabase: CheckDatabase;
  let createDatabaseClient: CreateDatabaseClient;
  let createLogger: CreateLogger;
  let createQueueProducer: CreateQueueProducer;
  let createRedisProbe: CreateRedisProbe;
  let createSystemHealthWorker: CreateSystemHealthWorker;
  let createS3StorageAdapter: CreateS3StorageAdapter;
  let closeWorkerWithinDeadline: CloseWorkerWithinDeadline;

  beforeAll(async () => {
    if (!runIntegrationTests) return;
    const [
      { loadApiConfigFromRuntime },
      db,
      observability,
      queue,
      storageAdapter,
      api,
      lifecycle,
      docRepo,
      docService,
      dupRepo,
    ] = await Promise.all([
      import("@axentra/config"),
      import("@axentra/db"),
      import("@axentra/observability"),
      import("@axentra/queue"),
      import("@axentra/storage"),
      import("../apps/api/src/app"),
      import("../apps/worker/src/lifecycle"),
      import("../apps/api/src/modules/documents/documents.repository"),
      import("../apps/api/src/modules/documents/documents.service"),
      import("../apps/api/src/modules/documents/duplicate.repository"),
    ]);
    checkDatabase = db.checkDatabase;
    closeDatabase = db.closeDatabase;
    createDatabaseClient = db.createDatabaseClient;
    createLogger = observability.createLogger;
    createQueueProducer = queue.createQueueProducer;
    createRedisProbe = queue.createRedisProbe;
    createSystemHealthWorker = queue.createSystemHealthWorker;
    createS3StorageAdapter = storageAdapter.createS3StorageAdapter;
    closeWorkerWithinDeadline = lifecycle.closeWorkerWithinDeadline;
    const config = loadApiConfigFromRuntime();
    database = createDatabaseClient(config.DATABASE_URL);
    redis = createRedisProbe(config.REDIS_URL, config.REDIS_HEALTH_TIMEOUT_MS);
    const rawStorage = createS3StorageAdapter(config);
    storage = {
      ...rawStorage,
      async putObject(input) {
        storageOps.push({ op: "put", key: input.key });
        return rawStorage.putObject(input);
      },
      async deleteObject(key) {
        storageOps.push({ op: "delete", key });
        return rawStorage.deleteObject(key);
      },
    };
    await Promise.all([checkDatabase(database), redis.checkHealth(), storage.initialize()]);

    const queueName = `axentra-integration-${crypto.randomUUID()}`;
    producer = createQueueProducer(queueName, config.REDIS_URL);
    worker = createSystemHealthWorker(queueName, config.REDIS_URL, 1, async (payload) => {
      onJobProcessed?.(payload);
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

    const documentService = docService.createDocumentService({
      repository: new docRepo.DocumentRepository(database.db),
      storage,
      queue: producer,
      contentHashRepository: new dupRepo.DrizzleDocumentContentHashRepository(database.db),
      logger: createLogger({
        service: "axentra-api",
        environment: config.APP_ENV,
        version: config.APP_VERSION,
        level: "fatal",
      }),
    });

    app = api.createApp({
      logger: createLogger({
        service: "axentra-api",
        environment: config.APP_ENV,
        version: config.APP_VERSION,
        level: config.LOG_LEVEL,
      }),
      version: config.APP_VERSION,
      tokenVerifier: integrationTokenVerifier,
      documentService,
      enableUploadRoute: true,
      readinessChecks: [
        {
          name: "database",
          check: async (): Promise<void> => {
            if (database === undefined) throw new Error("Database unavailable");
            await checkDatabase(database);
          },
        },
        {
          name: "redis",
          check: async (): Promise<void> => {
            if (redis === undefined) throw new Error("Redis unavailable");
            await redis.checkHealth();
          },
        },
        {
          name: "storage",
          check: async (): Promise<void> => {
            if (storage === undefined) throw new Error("Storage unavailable");
            await storage.checkHealth();
          },
        },
      ],
    });
  });

  afterAll(async () => {
    if (worker !== undefined) await closeWorkerWithinDeadline(worker, 2000);
    if (producer !== undefined) await producer.close();
    if (database !== undefined) await closeDatabase(database);
    if (redis !== undefined) await redis.close();
    if (storage !== undefined) await storage.close();
  });

  integrationTest("checks PostgreSQL, Redis, and MinIO contracts", async () => {
    if (database === undefined || redis === undefined || storage === undefined) {
      throw new Error("Integration infrastructure was not initialized");
    }
    await Promise.all([checkDatabase(database), redis.checkHealth(), storage.checkHealth()]);

    const key = `foundation-tests/${crypto.randomUUID()}`;
    const body = new TextEncoder().encode("axentra-foundation");
    await storage.putObject({ key, body, contentType: "text/plain" });
    expect(await storage.getObject(key)).toEqual(body);
    expect((await storage.headObject(key)).contentType).toBe("text/plain");
    await storage.deleteObject(key);
  });

  integrationTest("serves HTTP liveness and readiness contracts", async () => {
    if (app === undefined) throw new Error("API application was not initialized");

    const livenessResponse = await app.request("/api/v1/health");
    expect(livenessResponse.status).toBe(200);
    expect(await livenessResponse.json()).toMatchObject({
      success: true,
      data: { status: "ok", service: "axentra-api" },
    });

    const readinessResponse = await app.request("/api/v1/health/ready");
    expect(readinessResponse.status).toBe(200);
    expect(await readinessResponse.json()).toMatchObject({
      success: true,
      data: {
        status: "ready",
        dependencies: { database: "ready", redis: "ready", storage: "ready" },
      },
    });
  });

  integrationTest("processes a queue job and closes the worker gracefully", async () => {
    if (producer === undefined || worker === undefined) {
      throw new Error("Queue infrastructure was not initialized");
    }
    const payload: SystemHealthCheckJob = {
      jobId: crypto.randomUUID(),
      schemaVersion: 1,
      requestedAt: new Date().toISOString(),
    };
    const processed = new Promise<SystemHealthCheckJob>((resolve) => {
      onJobProcessed = resolve;
    });

    await expect(producer.enqueueSystemHealthCheck(payload)).resolves.toBe(payload.jobId);
    await expect(withTimeout(processed, 5000)).resolves.toEqual(payload);

    expect(await closeWorkerWithinDeadline(worker, 2000)).toBe("graceful");
    worker = undefined;
  });

  integrationTest("bounds a failed Redis startup dependency check", async () => {
    const probe = createRedisProbe("redis://127.0.0.1:6398/0", 250);
    try {
      await expect(probe.checkHealth()).rejects.toThrow();
    } finally {
      await probe.close();
    }
  });

  integrationTest("enforces one file per document database constraint", async () => {
    if (database === undefined) {
      throw new Error("Integration infrastructure was not initialized");
    }
    const { documents, documentFiles } = await import("@axentra/db");
    const documentId = crypto.randomUUID();

    await database.db.insert(documents).values({
      id: documentId,
      title: "Test Invariant Document",
    });

    try {
      await database.db.insert(documentFiles).values({
        documentId,
        storageKey: `docs/${documentId}/primary.pdf`,
        originalName: "primary.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        fileExtension: "pdf",
      });

      let duplicateError: unknown;
      try {
        await database.db.insert(documentFiles).values({
          documentId,
          storageKey: `docs/${documentId}/duplicate.pdf`,
          originalName: "duplicate.pdf",
          mimeType: "application/pdf",
          fileSize: 2048,
          fileExtension: "pdf",
        });
      } catch (error) {
        duplicateError = error;
      }

      expect(duplicateError).toBeDefined();
    } finally {
      await database.db.delete(documents).where(eq(documents.id, documentId));
    }
  });

  integrationTest("uploads valid PDF and persists to real PostgreSQL and MinIO (F7)", async () => {
    if (app === undefined || database === undefined || storage === undefined) {
      throw new Error("Integration infrastructure was not initialized");
    }
    const { documents, documentFiles, documentContentHashes } = await import("@axentra/db");

    const pdfContent = `%PDF-1.4\n% integration-test-${crypto.randomUUID()}\n`;
    const pdfBytes = new TextEncoder().encode(pdfContent);
    const expectedHash = crypto.createHash("sha256").update(pdfBytes).digest("hex");

    const formData = new FormData();
    formData.append(
      "file",
      new File([pdfBytes], "laporan-integrasi.pdf", { type: "application/pdf" }),
    );

    const response = await app.request("/api/v1/documents/upload", {
      method: "POST",
      headers: { authorization: "Bearer integration-member-token" },
      body: formData,
    });

    expect(response.status).toBe(200);
    const body = uploadDocumentSuccessResponseSchema.parse(await response.json());
    expect(body.success).toBe(true);
    expect(body.data.message).toBe("File diterima untuk diproses");
    expect(body.data.count).toBe(1);
    expect(body.data.files[0]?.filename).toBe("laporan-integrasi.pdf");
    expect(body.data.files[0]?.documentType).toBe("pdf");

    // 1. Verify PostgreSQL document_content_hashes record
    const hashRows = await database.db
      .select()
      .from(documentContentHashes)
      .where(eq(documentContentHashes.contentHash, expectedHash));
    expect(hashRows.length).toBe(1);
    expect(hashRows[0]?.contentHash).toBe(expectedHash);
    expect(hashRows[0]?.hashAlgorithm).toBe("sha256");

    const docId = hashRows[0]?.documentId;
    expect(docId).toBeDefined();

    if (docId !== undefined) {
      try {
        // 2. Verify PostgreSQL documents record
        const docRows = await database.db.select().from(documents).where(eq(documents.id, docId));
        expect(docRows.length).toBe(1);
        expect(docRows[0]?.processingStatus).toBe("queued");
        expect(docRows[0]?.title).toBe("laporan-integrasi.pdf");

        // 3. Verify PostgreSQL document_files record
        const fileRows = await database.db
          .select()
          .from(documentFiles)
          .where(eq(documentFiles.documentId, docId));
        expect(fileRows.length).toBe(1);
        expect(fileRows[0]?.mimeType).toBe("application/pdf");
        expect(fileRows[0]?.fileExtension).toBe("pdf");

        // 4. Verify MinIO object
        const storageKey = fileRows[0]?.storageKey;
        if (storageKey !== undefined) {
          const storedBytes = await storage.getObject(storageKey);
          expect(Buffer.from(storedBytes)).toEqual(Buffer.from(pdfBytes));
          await storage.deleteObject(storageKey);
        }
      } finally {
        await database.db.delete(documents).where(eq(documents.id, docId));
      }
    }
  });

  integrationTest(
    "handles concurrent same-content uploads via PostgreSQL unique constraint (F4)",
    async () => {
      if (app === undefined || database === undefined) {
        throw new Error("Integration infrastructure was not initialized");
      }
      const { documents, documentContentHashes } = await import("@axentra/db");

      const pdfContent = `%PDF-1.4\n% concurrent-race-${crypto.randomUUID()}\n`;
      const pdfBytes = new TextEncoder().encode(pdfContent);
      const raceHash = crypto.createHash("sha256").update(pdfBytes).digest("hex");

      const form1 = new FormData();
      form1.append("file", new File([pdfBytes], "race1.pdf", { type: "application/pdf" }));

      const form2 = new FormData();
      form2.append("file", new File([pdfBytes], "race2.pdf", { type: "application/pdf" }));

      const [res1, res2] = await Promise.all([
        app.request("/api/v1/documents/upload", {
          method: "POST",
          headers: { authorization: "Bearer integration-member-token" },
          body: form1,
        }),
        app.request("/api/v1/documents/upload", {
          method: "POST",
          headers: { authorization: "Bearer integration-member-token" },
          body: form2,
        }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const conflictRes = res1.status === 409 ? res1 : res2;
      const conflictBody = apiErrorSchema.parse(await conflictRes.json());
      expect(conflictBody.success).toBe(false);
      expect(conflictBody.error.code).toBe("DUPLICATE_DOCUMENT");
      expect(conflictBody.error.message).toBe("File ini sudah ada");

      // Clean up successfully created document
      const hashRows = await database.db
        .select()
        .from(documentContentHashes)
        .where(eq(documentContentHashes.contentHash, raceHash));
      const docId = hashRows[0]?.documentId;
      if (docId !== undefined) {
        await database.db.delete(documents).where(eq(documents.id, docId));
      }
    },
  );

  integrationTest(
    "enforces unique content hash per algorithm database constraint and detects duplicate",
    async () => {
      if (database === undefined) {
        throw new Error("Integration infrastructure was not initialized");
      }
      const { documents } = await import("@axentra/db");
      const { DrizzleDocumentContentHashRepository } =
        await import("../apps/api/src/modules/documents/duplicate.repository");

      const hashRepo = new DrizzleDocumentContentHashRepository(database.db);
      const documentId1 = crypto.randomUUID();
      const documentId2 = crypto.randomUUID();
      const contentHash = "e".repeat(64);

      await database.db.insert(documents).values([
        { id: documentId1, title: "Doc 1" },
        { id: documentId2, title: "Doc 2" },
      ]);

      try {
        const saved = await hashRepo.saveContentHash({
          documentId: documentId1,
          contentHash,
        });
        expect(saved.documentId).toBe(documentId1);
        expect(saved.contentHash).toBe(contentHash);

        // Verify findByContentHash
        const found = await hashRepo.findByContentHash(contentHash);
        expect(found).not.toBeNull();
        expect(found?.documentId).toBe(documentId1);

        // Verify findExistingHashes
        const existing = await hashRepo.findExistingHashes([contentHash, "f".repeat(64)]);
        expect(existing.has(contentHash)).toBe(true);
        expect(existing.has("f".repeat(64))).toBe(false);

        // Database unique constraint: attempting to insert same content_hash fails
        let duplicateDbError: unknown;
        try {
          await hashRepo.saveContentHash({
            documentId: documentId2,
            contentHash,
          });
        } catch (error) {
          duplicateDbError = error;
        }
        expect(duplicateDbError).toBeDefined();
      } finally {
        await database.db.delete(documents).where(eq(documents.id, documentId1));
        await database.db.delete(documents).where(eq(documents.id, documentId2));
      }
    },
  );

  integrationTest(
    "lists an uploaded filename and omits a soft-deleted document [BE-S1-06]",
    async () => {
      if (app === undefined || database === undefined || storage === undefined) {
        throw new Error("Integration infrastructure was not initialized");
      }
      const { documents, documentFiles, documentContentHashes } = await import("@axentra/db");
      const { recentDocumentListResponseSchema } = await import("@axentra/shared");
      const pdfBytes = new TextEncoder().encode(`%PDF-1.4\n% recent-list-${crypto.randomUUID()}\n`);
      const formData = new FormData();
      formData.append("file", new File([pdfBytes], "laporan.pdf", { type: "application/pdf" }));

      const uploaded = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: "Bearer integration-member-token" },
        body: formData,
      });
      expect(uploaded.status).toBe(200);

      const hash = crypto.createHash("sha256").update(pdfBytes).digest("hex");
      const hashRows = await database.db
        .select()
        .from(documentContentHashes)
        .where(eq(documentContentHashes.contentHash, hash));
      const docId = hashRows[0]?.documentId;
      expect(docId).toBeDefined();
      if (docId === undefined) return;

      try {
        const listed = await app.request("/api/v1/documents?limit=100", {
          headers: { authorization: "Bearer integration-member-token" },
        });
        expect(listed.status).toBe(200);
        const body = recentDocumentListResponseSchema.parse(await listed.json());
        const item = body.data.find((row) => row.id === docId);
        expect(item?.filename).toBe("laporan.pdf");
        expect(item?.processingStatus).toBe("queued");
        expect(item).not.toHaveProperty("tags");
        expect(item).not.toHaveProperty("category");

        await database.db
          .update(documents)
          .set({ deletedAt: new Date() })
          .where(eq(documents.id, docId));

        const afterDelete = await app.request("/api/v1/documents?limit=100", {
          headers: { authorization: "Bearer integration-member-token" },
        });
        const hidden = recentDocumentListResponseSchema.parse(await afterDelete.json());
        expect(hidden.data.some((row) => row.id === docId)).toBe(false);

        const fileRows = await database.db
          .select()
          .from(documentFiles)
          .where(eq(documentFiles.documentId, docId));
        const storageKey = fileRows[0]?.storageKey;
        if (storageKey !== undefined) await storage.deleteObject(storageKey);
      } finally {
        await database.db.delete(documents).where(eq(documents.id, docId));
      }
    },
  );

  integrationTest(
    "detects duplicate file on upload through DocumentRepository, rejects with 409, and prevents duplicate persistence (F6 / AC-02.01, AC-02.02, AC-02.03)",
    async () => {
      if (app === undefined || database === undefined || storage === undefined) {
        throw new Error("Integration infrastructure was not initialized");
      }
      const { documents, documentFiles, documentContentHashes } = await import("@axentra/db");

      const fileContent = `%PDF-1.4\n% duplicate-test-${crypto.randomUUID()}\n`;
      const pdfBytes = new TextEncoder().encode(fileContent);
      const hash = crypto.createHash("sha256").update(pdfBytes).digest("hex");

      const createdDocIds: string[] = [];
      const createdStorageKeys: string[] = [];
      let testError: unknown;
      const cleanupErrors: Error[] = [];

      try {
        // 1. First upload: valid file, should succeed (AC-02.03)
        const form1 = new FormData();
        form1.append("file", new File([pdfBytes], "original.pdf", { type: "application/pdf" }));

        const res1 = await app.request("/api/v1/documents/upload", {
          method: "POST",
          headers: { authorization: "Bearer integration-member-token" },
          body: form1,
        });

        expect(res1.status).toBe(200);
        const body1 = uploadDocumentSuccessResponseSchema.parse(await res1.json());
        expect(body1.success).toBe(true);
        expect(body1.data.message).toBe("File diterima untuk diproses");

        // Verify row created in document_content_hashes
        const hashRows = await database.db
          .select()
          .from(documentContentHashes)
          .where(eq(documentContentHashes.contentHash, hash));
        expect(hashRows.length).toBe(1);
        const originalDocId = hashRows[0]?.documentId;
        expect(originalDocId).toBeDefined();
        if (originalDocId === undefined) return;
        createdDocIds.push(originalDocId);

        // Verify storage object
        const fileRows = await database.db
          .select()
          .from(documentFiles)
          .where(eq(documentFiles.documentId, originalDocId));
        expect(fileRows.length).toBe(1);
        const storageKey1 = fileRows[0]?.storageKey;
        expect(storageKey1).toBeDefined();
        if (storageKey1 === undefined) return;
        createdStorageKeys.push(storageKey1);

        // 2. Second upload: exact same bytes (different filename), should fail with 409 (AC-02.01 & AC-02.02)
        const storageOpsIndexBeforeDuplicate = storageOps.length;

        const form2 = new FormData();
        form2.append("file", new File([pdfBytes], "copy-renamed.pdf", { type: "application/pdf" }));

        const res2 = await app.request("/api/v1/documents/upload", {
          method: "POST",
          headers: { authorization: "Bearer integration-member-token" },
          body: form2,
        });

        expect(res2.status).toBe(409);
        const body2 = apiErrorSchema.parse(await res2.json());
        expect(body2.success).toBe(false);
        expect(body2.error.code).toBe("DUPLICATE_DOCUMENT");
        expect(body2.error.message).toBe("File ini sudah ada");

        // 3. Verify database: observe all rows for this content hash across documents, files, and hashes
        const allHashRows = await database.db
          .select()
          .from(documentContentHashes)
          .where(eq(documentContentHashes.contentHash, hash));
        expect(allHashRows.length).toBe(1);

        const allDocRowsForContent = await database.db
          .select()
          .from(documents)
          .innerJoin(documentContentHashes, eq(documents.id, documentContentHashes.documentId))
          .where(eq(documentContentHashes.contentHash, hash));
        expect(allDocRowsForContent.length).toBe(1);
        expect(allDocRowsForContent[0]?.documents.id).toBe(originalDocId);

        const allFileRowsForContent = await database.db
          .select()
          .from(documentFiles)
          .innerJoin(
            documentContentHashes,
            eq(documentFiles.documentId, documentContentHashes.documentId),
          )
          .where(eq(documentContentHashes.contentHash, hash));
        expect(allFileRowsForContent.length).toBe(1);
        expect(allFileRowsForContent[0]?.document_files.storageKey).toBe(storageKey1);

        // 4. Verify storage: verify serial duplicate upload pre-check prevents redundant object creation
        const duplicateAttemptOps = storageOps.slice(storageOpsIndexBeforeDuplicate);
        const duplicateAttemptPuts = duplicateAttemptOps.filter((op) => op.op === "put");
        expect(duplicateAttemptPuts.length).toBe(0);

        // Verify the original stored document remains intact and unaltered
        const storedBytes = await storage.getObject(storageKey1);
        expect(Buffer.from(storedBytes)).toEqual(Buffer.from(pdfBytes));

        // 5. Third upload: different file bytes, should succeed
        const diffPdfBytes = new TextEncoder().encode(
          `%PDF-1.4\n% different-${crypto.randomUUID()}\n`,
        );
        const form3 = new FormData();
        form3.append(
          "file",
          new File([diffPdfBytes], "different.pdf", { type: "application/pdf" }),
        );

        const res3 = await app.request("/api/v1/documents/upload", {
          method: "POST",
          headers: { authorization: "Bearer integration-member-token" },
          body: form3,
        });

        expect(res3.status).toBe(200);
        const body3 = uploadDocumentSuccessResponseSchema.parse(await res3.json());
        expect(body3.success).toBe(true);
        expect(body3.data.message).toBe("File diterima untuk diproses");

        const diffHash = crypto.createHash("sha256").update(diffPdfBytes).digest("hex");
        const diffHashRows = await database.db
          .select()
          .from(documentContentHashes)
          .where(eq(documentContentHashes.contentHash, diffHash));
        expect(diffHashRows.length).toBe(1);
        const diffDocId = diffHashRows[0]?.documentId;
        expect(diffDocId).toBeDefined();
        if (diffDocId === undefined) return;
        createdDocIds.push(diffDocId);

        const diffFileRows = await database.db
          .select()
          .from(documentFiles)
          .where(eq(documentFiles.documentId, diffDocId));
        const storageKeyDiff = diffFileRows[0]?.storageKey;
        if (storageKeyDiff) createdStorageKeys.push(storageKeyDiff);

        // 6. Test check-duplicate endpoint against production DB
        const checkJsonRes = await app.request("/api/v1/documents/check-duplicate", {
          method: "POST",
          headers: {
            authorization: "Bearer integration-member-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({ contentHash: hash }),
        });
        expect(checkJsonRes.status).toBe(200);
        const checkJsonBody = checkDuplicateSuccessResponseSchema.parse(await checkJsonRes.json());
        expect(checkJsonBody.data.isDuplicate).toBe(true);
        expect(checkJsonBody.data.existingDocumentId).toBe(originalDocId);
        expect(checkJsonBody.data.message).toBe("File ini sudah ada");

        const checkForm = new FormData();
        checkForm.append("file", new File([pdfBytes], "check.pdf", { type: "application/pdf" }));
        const checkMultipartRes = await app.request("/api/v1/documents/check-duplicate", {
          method: "POST",
          headers: { authorization: "Bearer integration-member-token" },
          body: checkForm,
        });
        expect(checkMultipartRes.status).toBe(200);
        const checkMultiBody = checkDuplicateSuccessResponseSchema.parse(
          await checkMultipartRes.json(),
        );
        expect(checkMultiBody.data.isDuplicate).toBe(true);
        expect(checkMultiBody.data.existingDocumentId).toBe(originalDocId);
      } catch (error) {
        testError = error;
      } finally {
        for (const key of createdStorageKeys) {
          try {
            await storage.deleteObject(key);
          } catch (error) {
            cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
          }
        }
        for (const docId of createdDocIds) {
          try {
            await database.db.delete(documents).where(eq(documents.id, docId));
          } catch (error) {
            cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
          }
        }
      }

      if (testError !== undefined) {
        if (cleanupErrors.length > 0) {
          const cleanupDetails = cleanupErrors.map((e) => e.message).join("\n");
          console.error(`Integration test cleanup also failed with errors:\n${cleanupDetails}`);
        }
        throw testError;
      }
      if (cleanupErrors.length > 0) {
        const errorDetails = cleanupErrors.map((e) => e.message).join("\n");
        throw new Error(
          `Integration test cleanup failed with ${cleanupErrors.length} errors:\n${errorDetails}`,
        );
      }
    },
  );
});
