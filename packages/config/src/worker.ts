import { z } from "zod";
import type { EnvironmentSource } from "./common";
import { baseServerSchema, formatConfigurationError } from "./common";
import { storageEnvironmentSchema } from "./storage";

const workerEnvironmentSchema = baseServerSchema
  .extend({
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^redis(s)?$/ }),
    QUEUE_NAME: z.string().min(1).default("axentra-jobs"),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(2),
    WORKER_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000),
  })
  .and(storageEnvironmentSchema);

export type WorkerConfig = z.infer<typeof workerEnvironmentSchema>;

export function loadWorkerConfig(source: EnvironmentSource): WorkerConfig {
  const result = workerEnvironmentSchema.safeParse(source);
  if (!result.success) throw new Error(formatConfigurationError(result.error));
  return Object.freeze(result.data);
}

export function loadWorkerConfigFromRuntime(): WorkerConfig {
  return loadWorkerConfig(Bun.env);
}
