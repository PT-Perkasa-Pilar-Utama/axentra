import { z } from "zod";

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export const applicationEnvironmentSchema = z.enum(["development", "test", "production"]);

export const logLevelSchema = z.enum(["trace", "debug", "info", "warn", "error", "fatal"]);

export const baseServerSchema = z.object({
  APP_ENV: applicationEnvironmentSchema,
  APP_VERSION: z.string().min(1).default("0.1.0"),
  LOG_LEVEL: logLevelSchema.default("info"),
  REDIS_HEALTH_TIMEOUT_MS: z.coerce.number().int().min(250).max(10000).default(1500),
});

export function booleanFromEnvironment(defaultValue: boolean): z.ZodType<boolean> {
  return z.preprocess((value) => {
    if (value === undefined || value === "") return defaultValue;
    if (value === true || value === "true" || value === "1") return true;
    if (value === false || value === "false" || value === "0") return false;
    return value;
  }, z.boolean());
}

export function optionalUrl(): z.ZodType<string | undefined> {
  return z.preprocess((value) => (value === "" ? undefined : value), z.url().optional());
}

export function formatConfigurationError(error: z.ZodError): string {
  const fields = error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");
  return `Invalid environment configuration: ${fields}`;
}
