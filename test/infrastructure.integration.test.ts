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
import type { SystemHealthCheckJob } from "@axentra/shared";
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
    const [{ loadApiConfigFromRuntime }, db, observability, queue, storageAdapter, api, lifecycle] =
      await Promise.all([
        import("@axentra/config"),
        import("@axentra/db"),
        import("@axentra/observability"),
        import("@axentra/queue"),
        import("@axentra/storage"),
        import("../apps/api/src/app"),
        import("../apps/worker/src/lifecycle"),
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
    storage = createS3StorageAdapter(config);
    await Promise.all([checkDatabase(database), redis.checkHealth(), storage.initialize()]);

    app = api.createApp({
      logger: createLogger({
        service: "axentra-api",
        environment: config.APP_ENV,
        version: config.APP_VERSION,
        level: config.LOG_LEVEL,
      }),
      version: config.APP_VERSION,
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

    const queueName = `axentra-integration-${crypto.randomUUID()}`;
    producer = createQueueProducer(queueName, config.REDIS_URL);
    worker = createSystemHealthWorker(queueName, config.REDIS_URL, 1, async (payload) => {
      onJobProcessed?.(payload);
    });
    await worker.waitUntilReady();
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
});
