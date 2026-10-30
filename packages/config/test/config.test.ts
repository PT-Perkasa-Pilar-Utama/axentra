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
  AUTH_LOCAL_IDENTITY_DIRECTORY: "eyJpZCI6Im1lbWJlciJ9",
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

describe("WEB_ORIGIN (F30)", () => {
  const productionEnvironment = { ...serverEnvironment, APP_ENV: "production" } as const;

  test("defaults to the local Web dev server outside production", () => {
    const config = loadApiConfig(serverEnvironment);

    expect(config.WEB_ORIGIN).toBe("http://localhost:5173");
  });

  test("treats an empty value as unset outside production", () => {
    const config = loadApiConfig({ ...serverEnvironment, APP_ENV: "development", WEB_ORIGIN: "" });

    expect(config.WEB_ORIGIN).toBe("http://localhost:5173");
  });

  test("fails validation when production leaves it unset", () => {
    expect(() => loadApiConfig(productionEnvironment)).toThrow(
      "WEB_ORIGIN: is required when APP_ENV=production",
    );
  });

  test("fails validation when production sets it to an empty value", () => {
    expect(() => loadApiConfig({ ...productionEnvironment, WEB_ORIGIN: "" })).toThrow(
      "WEB_ORIGIN: is required when APP_ENV=production",
    );
  });

  test("accepts an explicit production origin and keeps only the origin part", () => {
    const config = loadApiConfig({
      ...productionEnvironment,
      WEB_ORIGIN: "https://web.axentra.internal/app/",
    });

    expect(config.WEB_ORIGIN).toBe("https://web.axentra.internal");
  });

  test("rejects an origin that is not http or https", () => {
    expect(() =>
      loadApiConfig({ ...productionEnvironment, WEB_ORIGIN: "ftp://web.axentra.internal" }),
    ).toThrow("WEB_ORIGIN");
  });
});
