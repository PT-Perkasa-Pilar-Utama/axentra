import { z } from "zod";
import type { EnvironmentSource } from "./common";
import { baseServerSchema, formatConfigurationError } from "./common";
import { storageEnvironmentSchema } from "./storage";

export const DEFAULT_WEB_ORIGIN = "http://localhost:5173";

const apiEnvironmentSchema = baseServerSchema
  .extend({
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    API_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^redis(s)?$/ }),
    QUEUE_NAME: z.string().min(1).default("axentra-jobs"),
    AUTH_LOCAL_IDENTITY_DIRECTORY: z.preprocess(
      (value) => (value === undefined || value === "" ? undefined : value),
      z.string().min(1),
    ),
    // The single browser origin allowed to call the API with credentials (CORS). Stored as an origin.
    WEB_ORIGIN: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z
        .url({ protocol: /^https?$/ })
        .transform((value) => new URL(value).origin)
        .optional(),
    ),
  })
  .superRefine((value, context) => {
    if (value.APP_ENV === "production" && value.WEB_ORIGIN === undefined) {
      context.addIssue({
        code: "custom",
        path: ["WEB_ORIGIN"],
        message: "is required when APP_ENV=production",
      });
    }
  })
  // Development and test fall back to the local Web dev server; production was refused above.
  .transform(({ WEB_ORIGIN, ...environment }) => ({
    ...environment,
    WEB_ORIGIN: WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN,
  }))
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
