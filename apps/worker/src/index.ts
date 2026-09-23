import { loadWorkerConfigFromRuntime } from "@axentra/config";
import { checkDatabase, closeDatabase, createDatabaseClient } from "@axentra/db";
import { createLogger, jobLogger, summarizeError } from "@axentra/observability";
import { createQueueProducer, createQueueWorker, createRedisProbe } from "@axentra/queue";
import { createS3StorageAdapter } from "@axentra/storage";
import type { DocumentProcessingJob, SystemHealthCheckJob } from "@axentra/shared";
import { closeResourcesWithinDeadline, closeWorkerWithinDeadline } from "./lifecycle";
import {
  DrizzleDocumentProcessingRepository,
  processDocumentJob,
} from "./processors/document.processor";
import { startProcessingRecovery } from "./processors/processing-recovery";

async function start(): Promise<void> {
  const config = loadWorkerConfigFromRuntime();
  const logger = createLogger({
    service: "axentra-worker",
    environment: config.APP_ENV,
    version: config.APP_VERSION,
    level: config.LOG_LEVEL,
  });
  const database = createDatabaseClient(config.DATABASE_URL);
  const redis = createRedisProbe(config.REDIS_URL, config.REDIS_HEALTH_TIMEOUT_MS);
  const storage = createS3StorageAdapter(config);

  try {
    await Promise.all([checkDatabase(database), redis.checkHealth(), storage.initialize()]);
  } catch (error) {
    await closeResourcesWithinDeadline(
      [() => closeDatabase(database), () => redis.close(), () => storage.close()],
      config.WORKER_SHUTDOWN_TIMEOUT_MS,
      (cleanupError) =>
        logger.warn({ error: summarizeError(cleanupError) }, "Worker cleanup failed"),
    );
    throw error;
  }

  const documentProcessingRepository = new DrizzleDocumentProcessingRepository(database.db);
  const recoveryQueue = createQueueProducer(
    config.QUEUE_NAME,
    config.REDIS_URL,
    config.REDIS_HEALTH_TIMEOUT_MS,
  );
  const stopProcessingRecovery = startProcessingRecovery({
    repository: documentProcessingRepository,
    queue: recoveryQueue,
    logger,
  });

  const handleSystemHealthCheck = async (payload: SystemHealthCheckJob): Promise<void> => {
    jobLogger(logger, payload.jobId).info(
      { schemaVersion: payload.schemaVersion, requestedAt: payload.requestedAt },
      "system health-check job completed",
    );
  };

  const handleDocumentProcessing = async (payload: DocumentProcessingJob): Promise<void> => {
    const jobScopedLogger = jobLogger(logger, payload.jobId);
    await processDocumentJob(payload, {
      repository: documentProcessingRepository,
      storage,
      logger: jobScopedLogger,
    });
  };

  const worker = createQueueWorker(config.QUEUE_NAME, config.REDIS_URL, config.WORKER_CONCURRENCY, {
    handleSystemHealthCheck,
    handleDocumentProcessing,
  });

  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, error }, "queue job failed");
  });
  worker.on("error", (error) => {
    logger.error({ error }, "queue worker error");
  });

  try {
    await worker.waitUntilReady();
  } catch (error) {
    await Promise.race([
      worker.close(true).catch((closeError: unknown) => {
        logger.warn({ error: summarizeError(closeError) }, "Worker startup close failed");
      }),
      new Promise((resolve) => setTimeout(resolve, config.WORKER_SHUTDOWN_TIMEOUT_MS)),
    ]);
    stopProcessingRecovery();
    await closeResourcesWithinDeadline(
      [
        () => closeDatabase(database),
        () => redis.close(),
        () => storage.close(),
        () => recoveryQueue.close(),
      ],
      config.WORKER_SHUTDOWN_TIMEOUT_MS,
      (cleanupError) =>
        logger.warn({ error: summarizeError(cleanupError) }, "Worker cleanup failed"),
    );
    throw error;
  }
  logger.info(
    { queueName: config.QUEUE_NAME, concurrency: config.WORKER_CONCURRENCY },
    "Worker started",
  );

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Worker shutdown started");
    const workerCloseMode = await closeWorkerWithinDeadline(
      worker,
      config.WORKER_SHUTDOWN_TIMEOUT_MS,
      (closeError) => logger.warn({ error: summarizeError(closeError) }, "Worker close failed"),
    );
    if (workerCloseMode === "forced") {
      logger.warn("Worker exceeded graceful shutdown deadline; active jobs were cancelled");
    }
    stopProcessingRecovery();
    const resourcesClosed = await closeResourcesWithinDeadline(
      [
        () => closeDatabase(database),
        () => redis.close(),
        () => storage.close(),
        () => recoveryQueue.close(),
      ],
      config.WORKER_SHUTDOWN_TIMEOUT_MS,
      (cleanupError) =>
        logger.warn({ error: summarizeError(cleanupError) }, "Worker cleanup failed"),
    );
    if (!resourcesClosed) logger.warn("Worker resource cleanup exceeded shutdown deadline");
    logger.info("Worker shutdown completed");
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

await start().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ event: "worker_startup_failed", error: summarizeError(error) })}\n`,
  );
  process.exit(1);
});
