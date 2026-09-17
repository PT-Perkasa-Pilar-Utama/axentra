import pino from "pino";
import type { Logger, LoggerOptions } from "pino";

export type { Logger } from "pino";

export type LoggerConfiguration = {
  service: "axentra-api" | "axentra-worker";
  environment: "development" | "test" | "production";
  version: string;
  level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  destination?: pino.DestinationStream;
};

const redactPaths = [
  "**.password",
  "**.token",
  "**.accessToken",
  "**.refreshToken",
  "**.authorization",
  "**.cookie",
  "**.DATABASE_URL",
  "**.REDIS_URL",
  "**.S3_ACCESS_KEY_ID",
  "**.S3_SECRET_ACCESS_KEY",
  "**.signedUrl",
  "**.documentContent",
  "*.password",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.authorization",
  "*.cookie",
  "*.DATABASE_URL",
  "*.REDIS_URL",
  "*.S3_ACCESS_KEY_ID",
  "*.S3_SECRET_ACCESS_KEY",
  "*.signedUrl",
  "*.documentContent",
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "signedUrl",
  "documentContent",
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
];

export function summarizeError(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return { type: typeof value };
  const name = Reflect.get(value, "name");
  const type = Reflect.get(value, "type");
  const code = Reflect.get(value, "code");
  const status = Reflect.get(value, "status");
  return {
    ...(typeof name === "string" ? { name } : {}),
    ...(typeof type === "string" ? { type } : {}),
    ...(typeof code === "string" ? { code } : {}),
    ...(typeof status === "number" ? { status } : {}),
  };
}

export function createLogger(configuration: LoggerConfiguration): Logger {
  const options: LoggerOptions = {
    level: configuration.level,
    base: {
      service: configuration.service,
      environment: configuration.environment,
      version: configuration.version,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: redactPaths,
      censor: "[REDACTED]",
    },
    serializers: {
      error: summarizeError,
    },
  };
  return pino(options, configuration.destination);
}

export function requestLogger(logger: Logger, requestId: string): Logger {
  return logger.child({ requestId });
}

export function jobLogger(logger: Logger, jobId: string): Logger {
  return logger.child({ jobId });
}
