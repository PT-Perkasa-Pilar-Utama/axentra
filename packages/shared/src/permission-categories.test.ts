import { describe, expect, it } from "bun:test";
import {
  PERMISSION_CATEGORIES_DEFAULT_LIMIT,
  PERMISSION_CATEGORIES_MAX_LIMIT,
  permissionCategoriesQuerySchema,
  permissionCategoriesResponseSchema,
  permissionCategorySchema,
} from "./permission-categories";

describe("permissionCategoriesQuerySchema", () => {
  it("applies default limit when omitted or blank", () => {
    expect(permissionCategoriesQuerySchema.parse({})).toEqual({
      limit: PERMISSION_CATEGORIES_DEFAULT_LIMIT,
    });
    expect(permissionCategoriesQuerySchema.parse({ limit: "" })).toEqual({
      limit: PERMISSION_CATEGORIES_DEFAULT_LIMIT,
    });
  });

  it("coerces valid integer strings and accepts boundary values", () => {
    expect(permissionCategoriesQuerySchema.parse({ limit: "1" })).toEqual({ limit: 1 });
    expect(permissionCategoriesQuerySchema.parse({ limit: 25 })).toEqual({ limit: 25 });
    expect(
      permissionCategoriesQuerySchema.parse({
        limit: String(PERMISSION_CATEGORIES_MAX_LIMIT),
      }),
    ).toEqual({
      limit: PERMISSION_CATEGORIES_MAX_LIMIT,
    });
  });

  it("rejects non-positive, out-of-range, non-integer, whitespace, and non-primitive values", () => {
    expect(permissionCategoriesQuerySchema.safeParse({ limit: "0" })).toEqual({
      success: false,
      error: expect.anything(),
    });
    const negativeRes = permissionCategoriesQuerySchema.safeParse({ limit: "-1" });
    expect(negativeRes.success).toBe(false);
    if (!negativeRes.success) {
      expect(negativeRes.error.issues[0]?.message).toBe("Limit minimal 1");
    }
    expect(
      permissionCategoriesQuerySchema.safeParse({
        limit: String(PERMISSION_CATEGORIES_MAX_LIMIT + 1),
      }).success,
    ).toBe(false);
    expect(permissionCategoriesQuerySchema.safeParse({ limit: "2.5" }).success).toBe(false);
    expect(permissionCategoriesQuerySchema.safeParse({ limit: "0x10" }).success).toBe(false);
    expect(permissionCategoriesQuerySchema.safeParse({ limit: "1e1" }).success).toBe(false);
    expect(permissionCategoriesQuerySchema.safeParse({ limit: " 10 " }).success).toBe(false);
    expect(permissionCategoriesQuerySchema.safeParse({ limit: "abc" }).success).toBe(false);
    expect(permissionCategoriesQuerySchema.safeParse({ limit: "   " }).success).toBe(false);
    expect(permissionCategoriesQuerySchema.safeParse({ limit: true }).success).toBe(false);
    expect(permissionCategoriesQuerySchema.safeParse({ limit: [10] }).success).toBe(false);
  });
});

describe("permissionCategoriesResponseSchema", () => {
  it("validates a permission category list response envelope", () => {
    const item = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Reporting",
      slug: "reporting",
      downloadEnabled: false,
      createdAt: "2026-10-30T08:00:00.000Z",
      updatedAt: "2026-10-30T08:00:00.000Z",
    };

    expect(permissionCategorySchema.parse(item)).toEqual(item);
    expect(
      permissionCategoriesResponseSchema.safeParse({
        success: true,
        data: [item],
      }).success,
    ).toBe(true);
  });

  it("rejects responses exceeding PERMISSION_CATEGORIES_MAX_LIMIT", () => {
    const items = Array.from({ length: PERMISSION_CATEGORIES_MAX_LIMIT + 1 }, (_, index) => ({
      id: "11111111-1111-4111-8111-111111111111",
      name: `Category ${index}`,
      slug: `category-${index}`,
      downloadEnabled: false,
      createdAt: "2026-10-30T08:00:00.000Z",
      updatedAt: "2026-10-30T08:00:00.000Z",
    }));

    expect(
      permissionCategoriesResponseSchema.safeParse({
        success: true,
        data: items,
      }).success,
    ).toBe(false);
  });
});
