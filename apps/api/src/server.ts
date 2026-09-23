import { loadApiConfigFromRuntime } from "@axentra/config";
import { checkDatabase, closeDatabase, createDatabaseClient } from "@axentra/db";
import { createLogger, summarizeError } from "@axentra/observability";
import { createQueueProducer, createRedisProbe } from "@axentra/queue";
import { createS3StorageAdapter } from "@axentra/storage";
import { createApp } from "./app";
import { createAuthService } from "./modules/auth/auth.service";
import { createRuntimeAuthenticator } from "./modules/auth/runtime-authenticator";
import { DocumentRepository } from "./modules/documents/documents.repository";
import { createDocumentService } from "./modules/documents/documents.service";
import { DrizzleDocumentContentHashRepository } from "./modules/documents/duplicate.repository";
import { DrizzleDocumentMetadataRepository } from "./modules/documents/metadata.repository";

const closeResourcesWithinDeadline = async (
  operations: Array<() => Promise<unknown>>,
  timeoutMs: number,
  onError?: (error: unknown) => void,
): Promise<boolean> => {
  const cleanup = (async () => {
    await Promise.allSettled(
      operations.map(async (operation) => {
        try {
          await operation();
        } catch (error) {
          onError?.(error);
        }
      }),
    );
    return true;
  })();
  return Promise.race([
    cleanup,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
};

async function start(): Promise<void> {
  const config = loadApiConfigFromRuntime();
  const logger = createLogger({
    service: "axentra-api",
    environment: config.APP_ENV,
    version: config.APP_VERSION,
    level: config.LOG_LEVEL,
  });
  const database = createDatabaseClient(config.DATABASE_URL);
  const redis = createRedisProbe(config.REDIS_URL, config.REDIS_HEALTH_TIMEOUT_MS);
  const queue = createQueueProducer(
    config.QUEUE_NAME,
    config.REDIS_URL,
    config.REDIS_HEALTH_TIMEOUT_MS,
  );
  const storage = createS3StorageAdapter(config);

  try {
    await storage.initialize();
  } catch (error) {
    await closeResourcesWithinDeadline(
      [
        () => closeDatabase(database),
        () => redis.close(),
        () => queue.close(),
        () => storage.close(),
      ],
      config.API_SHUTDOWN_TIMEOUT_MS,
      (cleanupError) => logger.warn({ error: summarizeError(cleanupError) }, "API cleanup failed"),
    );
    throw error;
  }

  const authService = createAuthService({
    authenticator: createRuntimeAuthenticator(config),
  });
  const documentRepository = new DocumentRepository(database.db);
  const documentService = createDocumentService({
    repository: documentRepository,
    storage,
    queue,
    logger,
    metadataRepository: new DrizzleDocumentMetadataRepository(database.db),
    contentHashRepository: new DrizzleDocumentContentHashRepository(database.db),
  });

  const app = createApp({
    logger,
    version: config.APP_VERSION,
    readinessChecks: [
      { name: "database", check: () => checkDatabase(database) },
      { name: "redis", check: redis.checkHealth },
      { name: "storage", check: storage.checkHealth },
    ],
    authService,
    documentService,
    enableUploadRoute: true,
  });

  const server = Bun.serve({
    port: config.API_PORT,
    fetch: app.fetch,
  });
  logger.info({ port: server.port }, "API started");

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "API shutdown started");
    server.stop(false);
    const resourcesClosed = await closeResourcesWithinDeadline(
      [
        () => closeDatabase(database),
        () => redis.close(),
        () => queue.close(),
        () => storage.close(),
      ],
      config.API_SHUTDOWN_TIMEOUT_MS,
      (cleanupError) => logger.warn({ error: summarizeError(cleanupError) }, "API cleanup failed"),
    );
    if (!resourcesClosed) logger.warn("API resource cleanup exceeded shutdown deadline");
    logger.info("API shutdown completed");
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

await start().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ event: "api_startup_failed", error: summarizeError(error) })}\n`,
  );
  process.exit(1);
});
