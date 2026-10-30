import { describe, expect, it } from "bun:test";
import {
  MAX_FILTER_TAGS,
  parseTagsQuery,
  recentDocumentListQuerySchema,
  searchDocumentsQuerySchema,
  searchDocumentsResponseSchema,
} from "../src";

describe("tag filter query contracts", () => {
  describe("parseTagsQuery", () => {
    it("returns undefined for undefined, null, or empty string", () => {
      expect(parseTagsQuery(undefined)).toBeUndefined();
      expect(parseTagsQuery(null)).toBeUndefined();
      expect(parseTagsQuery("")).toBeUndefined();
    });

    it("parses single string tag", () => {
      expect(parseTagsQuery("Strategy")).toEqual(["Strategy"]);
    });

    it("parses comma-separated tag string", () => {
      expect(parseTagsQuery("Strategy, Legal,Finance")).toEqual(["Strategy", "Legal", "Finance"]);
    });

    it("parses repeated array of tags", () => {
      expect(parseTagsQuery(["Strategy", "Legal"])).toEqual(["Strategy", "Legal"]);
    });

    it("deduplicates tags and trims whitespace", () => {
      expect(parseTagsQuery([" Strategy ", "Strategy", "Legal "])).toEqual(["Strategy", "Legal"]);
    });
  });

  describe("recentDocumentListQuerySchema with tags", () => {
    it("accepts valid single tag", () => {
      const parsed = recentDocumentListQuerySchema.parse({ tags: "Strategy" });
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(20);
      expect(parsed.tags).toEqual(["Strategy"]);
    });

    it("accepts multi-tag query via array or comma-separated", () => {
      const parsedArray = recentDocumentListQuerySchema.parse({ tags: ["Strategy", "Legal"] });
      expect(parsedArray.tags).toEqual(["Strategy", "Legal"]);

      const parsedCsv = recentDocumentListQuerySchema.parse({ tags: "Strategy,Legal" });
      expect(parsedCsv.tags).toEqual(["Strategy", "Legal"]);
    });

    it("rejects when number of tags exceeds limit", () => {
      const manyTags = Array.from({ length: MAX_FILTER_TAGS + 1 }, (_, i) => `tag-${i}`);
      expect(() => recentDocumentListQuerySchema.parse({ tags: manyTags })).toThrow();
    });

    it("rejects tag exceeding maximum length", () => {
      const longTag = "a".repeat(51);
      expect(() => recentDocumentListQuerySchema.parse({ tags: [longTag] })).toThrow();
    });
  });

  describe("searchDocumentsQuerySchema", () => {
    it("accepts search query with tags, category, page, and limit", () => {
      const categoryId = "11111111-1111-4111-8111-111111111111";
      const parsed = searchDocumentsQuerySchema.parse({
        q: "laporan",
        tags: ["Strategy", "Legal"],
        categoryId,
        page: "2",
        limit: "10",
      });

      expect(parsed).toEqual({
        q: "laporan",
        tags: ["Strategy", "Legal"],
        categoryId,
        page: 2,
        limit: 10,
      });
    });

    it("accepts empty input and applies defaults", () => {
      const parsed = searchDocumentsQuerySchema.parse({});
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(20);
      expect(parsed.q).toBeUndefined();
      expect(parsed.tags).toBeUndefined();
    });
  });

  describe("searchDocumentsResponseSchema", () => {
    it("validates successful search documents response", () => {
      const response = {
        success: true,
        data: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            filename: "laporan.pdf",
            processingStatus: "completed",
            createdAt: "2026-09-22T02:00:00.000Z",
            snippet: "matching snippet text",
          },
        ],
        meta: { page: 1, limit: 20, total: 1 },
      };

      const parsed = searchDocumentsResponseSchema.parse(response);
      expect(parsed.success).toBe(true);
      expect(parsed.data[0]?.snippet).toBe("matching snippet text");
    });
  });
});
