import { describe, expect, it } from "bun:test";
import { topTagSchema, topTagsResponseSchema } from "./tags";

const validTag = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "finance",
  documentCount: 2,
};

describe("Top Tags shared contract", () => {
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
