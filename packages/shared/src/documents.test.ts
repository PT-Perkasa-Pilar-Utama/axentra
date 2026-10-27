import { describe, expect, it } from "bun:test";
import { documentProcessingStatusSchema } from "./documents";

describe("documentProcessingStatusSchema", () => {
  it("accepts completed, the status the worker and database write", () => {
    expect(documentProcessingStatusSchema.parse("completed")).toBe("completed");
  });

  it("rejects the legacy processed literal that the database never stores", () => {
    expect(documentProcessingStatusSchema.safeParse("processed").success).toBe(false);
  });
});
