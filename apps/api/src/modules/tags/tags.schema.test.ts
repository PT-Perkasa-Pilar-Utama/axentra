import { describe, expect, it } from "bun:test";
import { TOP_TAGS_MAX_CONTEXT_DOCUMENTS } from "@axentra/shared";
import { topTagsQuerySchema } from "./tags.schema";

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";

describe("topTagsQuerySchema — BE-S2-02 F2", () => {
  it("defaults the limit to 10 for the dashboard context", () => {
    expect(topTagsQuerySchema.parse({ context: "dashboard" })).toEqual({
      context: "dashboard",
      limit: 10,
    });
  });

  it("rejects a limit outside 3 to 20", () => {
    expect(topTagsQuerySchema.safeParse({ context: "dashboard", limit: "2" }).success).toBe(false);
    expect(topTagsQuerySchema.safeParse({ context: "dashboard", limit: "21" }).success).toBe(false);
  });

  it("rejects an unknown context", () => {
    expect(topTagsQuerySchema.safeParse({ context: "analytics" }).success).toBe(false);
  });

  it("rejects documentIds in the dashboard context", () => {
    const result = topTagsQuerySchema.safeParse({
      context: "dashboard",
      documentIds: [DOCUMENT_ID],
    });

    expect(result.success).toBe(false);
  });

  it("accepts documentIds in the search context", () => {
    expect(
      topTagsQuerySchema.safeParse({ context: "search", documentIds: [DOCUMENT_ID] }).success,
    ).toBe(true);
  });

  it("accepts exactly the shared maximum of 100 documentIds in the search context", () => {
    const atLimit = Array.from({ length: TOP_TAGS_MAX_CONTEXT_DOCUMENTS }, () => DOCUMENT_ID);

    expect(topTagsQuerySchema.safeParse({ context: "search", documentIds: atLimit }).success).toBe(
      true,
    );
  });

  it("rejects 101 documentIds in the search context", () => {
    const overLimit = Array.from({ length: TOP_TAGS_MAX_CONTEXT_DOCUMENTS + 1 }, () => DOCUMENT_ID);
    const result = topTagsQuerySchema.safeParse({ context: "search", documentIds: overLimit });

    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "documentIds",
    ]);
  });
});
