import { z } from "zod";
import type { EnvironmentSource } from "./common";
import { baseServerSchema, formatConfigurationError } from "./common";
import { storageEnvironmentSchema } from "./storage";

const apiEnvironmentSchema = baseServerSchema
  .extend({
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    API_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^redis(s)?$/ }),
    QUEUE_NAME: z.string().min(1).default("axentra-jobs"),
  })
  .and(storageEnvironmentSchema);

export type ApiConfig = z.infer<typeof apiEnvironmentSchema>;

export function loadApiConfig(source: EnvironmentSource): ApiConfig {
  const result = apiEnvironmentSchema.safeParse(source);
  if (!result.success) throw new Error(formatConfigurationError(result.error));
  return Object.freeze(result.data);
}

export function loadApiConfigFromRuntime(): ApiConfig {
  return loadApiConfig(Bun.env);
}
