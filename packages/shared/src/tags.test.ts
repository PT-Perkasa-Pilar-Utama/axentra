import { describe, expect, it } from "bun:test";
import { topTagSchema, topTagsQuerySchema, topTagsResponseSchema } from "./tags";

const validTag = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "finance",
  documentCount: 2,
};

describe("Top Tags shared contract", () => {
  it("defaults the context query limit and accepts search document IDs", () => {
    expect(topTagsQuerySchema.parse({ context: "dashboard" })).toEqual({
      context: "dashboard",
      limit: 10,
    });
    expect(
      topTagsQuerySchema.parse({
        context: "search",
        limit: "20",
        documentIds: [validTag.id],
      }),
    ).toEqual({ context: "search", limit: 20, documentIds: [validTag.id] });
  });

  it("rejects limits above the API maximum", () => {
    expect(topTagsQuerySchema.safeParse({ context: "dashboard", limit: "21" }).success).toBe(false);
  });

  it("requires room for up to three tags from the most recently tagged document", () => {
    expect(topTagsQuerySchema.safeParse({ context: "dashboard", limit: "2" }).success).toBe(false);
  });

  it("rejects document IDs in the dashboard context", () => {
    expect(
      topTagsQuerySchema.safeParse({ context: "dashboard", documentIds: [validTag.id] }).success,
    ).toBe(false);
  });

  it("rejects more than one hundred search result IDs", () => {
    const documentIds = Array.from(
      { length: 101 },
      (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    );

    expect(topTagsQuerySchema.safeParse({ context: "search", documentIds }).success).toBe(false);
  });

  it("validates the tag shape and bounded success response", () => {
    expect(topTagSchema.parse(validTag)).toEqual(validTag);
    expect(topTagsResponseSchema.parse({ success: true, data: [validTag] }).data).toEqual([
      validTag,
    ]);
    expect(topTagSchema.safeParse({ ...validTag, documentCount: -1 }).success).toBe(false);
    expect(
      topTagsResponseSchema.safeParse({
        success: true,
        data: Array.from({ length: 21 }, (_, index) => ({
          ...validTag,
          id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        })),
      }).success,
    ).toBe(false);
  });
});
