import { describe, expect, test } from "bun:test";
import { createLogger, type Logger } from "../src";

// The redaction contract, written out here rather than imported so that dropping a key from the
// implementation fails a test.
const SENSITIVE_KEYS = [
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cookie",
  "DATABASE_URL",
  "REDIS_URL",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "signedUrl",
  "downloadUrl",
  "previewUrl",
  "storageKey",
  "objectKey",
  "documentContent",
] as const;

// test.each treats a flat array as a table of rows, so each key is wrapped in a one-element tuple.
const SENSITIVE_KEY_ROWS = SENSITIVE_KEYS.map((key) => [key] as const);

type CapturedLogger = { logger: Logger; lines: string[] };

function captureLogger(): CapturedLogger {
  const lines: string[] = [];
  const logger = createLogger({
    service: "axentra-api",
    environment: "test",
    version: "0.1.0",
    level: "info",
    destination: {
      write(chunk: string): void {
        lines.push(chunk);
      },
    },
  });
  return { logger, lines };
}

function onlyEntry(lines: string[]): unknown {
  expect(lines).toHaveLength(1);
  return JSON.parse(lines.join(""));
}

describe("logger redaction contract", () => {
  test("redacts credential-shaped fields", async () => {
    const { logger, lines } = captureLogger();

    logger.info(
      {
        S3_SECRET_ACCESS_KEY: "must-not-appear",
        payload: { token: "nested-secret", DATABASE_URL: "postgres://user:pass@db" },
        error: new Error("must-not-appear-error-message"),
      },
      "configuration loaded",
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(lines.join("")).not.toContain("must-not-appear");
    expect(lines.join("")).not.toContain("nested-secret");
    expect(lines.join("")).not.toContain("postgres://user:pass@db");
    expect(lines.join("")).not.toContain("must-not-appear-error-message");
    expect(lines.join("")).toContain("[REDACTED]");
  });

  test.each(SENSITIVE_KEY_ROWS)("redacts %s at the root of the log object", (key) => {
    const { logger, lines } = captureLogger();
    const secret = `root-secret-${key}`;

    logger.info({ [key]: secret, requestId: "req-1" }, "probe");

    expect(onlyEntry(lines)).toMatchObject({ [key]: "[REDACTED]", requestId: "req-1" });
    expect(lines.join("")).not.toContain(secret);
  });

  test.each(SENSITIVE_KEY_ROWS)("redacts %s one level below the root", (key) => {
    const { logger, lines } = captureLogger();
    const secret = `nested-secret-${key}`;

    logger.info({ document: { [key]: secret, documentId: "doc-1" } }, "probe");

    expect(onlyEntry(lines)).toMatchObject({
      document: { [key]: "[REDACTED]", documentId: "doc-1" },
    });
    expect(lines.join("")).not.toContain(secret);
  });

  test.each(SENSITIVE_KEY_ROWS)("redacts %s two levels below the root", (key) => {
    const { logger, lines } = captureLogger();
    const secret = `deep-secret-${key}`;

    logger.info({ req: { headers: { [key]: secret, accept: "application/json" } } }, "probe");

    expect(onlyEntry(lines)).toMatchObject({
      req: { headers: { [key]: "[REDACTED]", accept: "application/json" } },
    });
    expect(lines.join("")).not.toContain(secret);
  });

  test("redacts a sensitive key bound to a child logger", () => {
    const { logger, lines } = captureLogger();

    logger.child({ storageKey: "documents/child-bound-key.pdf" }).info("probe");

    expect(onlyEntry(lines)).toMatchObject({ storageKey: "[REDACTED]" });
    expect(lines.join("")).not.toContain("child-bound-key");
  });

  test("redacts sensitive keys inside an array of objects", () => {
    const { logger, lines } = captureLogger();

    logger.info({ files: [{ objectKey: "documents/array-key.pdf", fileSize: 10 }] }, "probe");

    expect(onlyEntry(lines)).toMatchObject({ files: [{ objectKey: "[REDACTED]", fileSize: 10 }] });
    expect(lines.join("")).not.toContain("array-key");
  });
});
