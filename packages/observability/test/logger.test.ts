import { describe, expect, test } from "bun:test";
import { createLogger } from "../src";

describe("logger redaction contract", () => {
  test("redacts credential-shaped fields", async () => {
    const records: string[] = [];
    const destination = {
      write(chunk: string) {
        records.push(chunk);
      },
    };
    const logger = createLogger({
      service: "axentra-api",
      environment: "test",
      version: "0.1.0",
      level: "info",
      destination,
    });
    logger.info(
      {
        S3_SECRET_ACCESS_KEY: "must-not-appear",
        payload: { token: "nested-secret", DATABASE_URL: "postgres://user:pass@db" },
        error: new Error("must-not-appear-error-message"),
      },
      "configuration loaded",
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(records.join("")).not.toContain("must-not-appear");
    expect(records.join("")).not.toContain("nested-secret");
    expect(records.join("")).not.toContain("postgres://user:pass@db");
    expect(records.join("")).not.toContain("must-not-appear-error-message");
    expect(records.join("")).toContain("[REDACTED]");
  });
});
