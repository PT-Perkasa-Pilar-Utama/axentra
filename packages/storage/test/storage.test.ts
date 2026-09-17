import { describe, expect, test } from "bun:test";
import { validateObjectKey } from "../src/storage";

describe("storage object keys", () => {
  test("accepts provider-neutral generated keys", () => {
    expect(validateObjectKey("documents/01J/source")).toBe("documents/01J/source");
  });

  test("rejects absolute and traversal keys", () => {
    expect(() => validateObjectKey("/documents/file")).toThrow();
    expect(() => validateObjectKey("documents/../secret")).toThrow();
  });
});
