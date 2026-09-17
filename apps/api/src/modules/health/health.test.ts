import { describe, expect, test } from "bun:test";
import { evaluateReadiness } from "./health.service";

describe("health readiness", () => {
  test("reports ready when every dependency succeeds", async () => {
    const result = await evaluateReadiness("axentra-api", "0.1.0", [
      { name: "database", check: async () => undefined },
      { name: "redis", check: async () => undefined },
      { name: "storage", check: async () => undefined },
    ]);
    expect(result.ready).toBe(true);
    expect(result.data.status).toBe("ready");
  });

  test("sanitizes a dependency failure into unavailable", async () => {
    const result = await evaluateReadiness("axentra-api", "0.1.0", [
      { name: "database", check: async () => Promise.reject(new Error("private endpoint")) },
    ]);
    expect(result.ready).toBe(false);
    expect(result.data.dependencies.database).toBe("unavailable");
    expect(JSON.stringify(result.data)).not.toContain("private endpoint");
  });
});
