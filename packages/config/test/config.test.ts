import { describe, expect, test } from "bun:test";
import { loadApiConfig } from "../src/api";
import { loadWebConfig } from "../src/web";
import { loadWorkerConfig } from "../src/worker";

const serverEnvironment = {
  APP_ENV: "test",
  APP_VERSION: "0.1.0",
  LOG_LEVEL: "info",
  DATABASE_URL: "postgres://axentra:test@localhost:5432/axentra_test",
  REDIS_URL: "redis://localhost:6379/0",
  S3_PROVIDER: "minio",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "ap-southeast-3",
  S3_BUCKET: "axentra-test",
  S3_ACCESS_KEY_ID: "local-test-user",
  S3_SECRET_ACCESS_KEY: "local-test-password",
  S3_FORCE_PATH_STYLE: "true",
} as const;

describe("configuration", () => {
  test("loads API configuration and coerces values", () => {
    const config = loadApiConfig({ ...serverEnvironment, API_PORT: "3001" });
    expect(config.API_PORT).toBe(3001);
    expect(config.S3_FORCE_PATH_STYLE).toBe(true);
  });

  test("rejects an incomplete MinIO configuration", () => {
    expect(() => loadApiConfig({ ...serverEnvironment, S3_ENDPOINT: "" })).toThrow("S3_ENDPOINT");
  });

  test("loads Worker defaults", () => {
    const config = loadWorkerConfig(serverEnvironment);
    expect(config.QUEUE_NAME).toBe("axentra-jobs");
    expect(config.WORKER_CONCURRENCY).toBe(2);
  });

  test("keeps Web configuration browser-safe", () => {
    expect(loadWebConfig({}).VITE_API_BASE_URL).toBe("/api/v1");
  });
});
