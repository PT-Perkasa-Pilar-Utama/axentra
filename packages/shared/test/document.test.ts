import { describe, expect, it } from "bun:test";

import {
  CATEGORIES_DEFAULT_LIMIT,
  CATEGORIES_MAX_LIMIT,
  categoriesQuerySchema,
  categoriesResponseSchema,
  categorySummarySchema,
  documentCategoryResponseSchema,
  documentDetailSchema,
  documentFileInfoSchema,
  documentMetadataResultSchema,
  documentMetadataSchema,
  documentSmartTagsResponseSchema,
  documentSummarySchema,
  processingStatusSchema,
  recentDocumentListQuerySchema,
  recentDocumentListResponseSchema,
  recentDocumentSchema,
  smartTagSchema,
} from "../src/document";

describe("document shared schemas", () => {
  describe("processingStatusSchema", () => {
    it("accepts valid processing statuses", () => {
      expect(processingStatusSchema.parse("queued")).toBe("queued");
      expect(processingStatusSchema.parse("processing")).toBe("processing");
      expect(processingStatusSchema.parse("completed")).toBe("completed");
      expect(processingStatusSchema.parse("failed")).toBe("failed");
    });

    it("rejects unknown statuses", () => {
      expect(() => processingStatusSchema.parse("pending")).toThrow();
      expect(() => processingStatusSchema.parse("processed")).toThrow();
      expect(() => processingStatusSchema.parse(123)).toThrow();
    });
  });

  describe("recentDocumentSchema", () => {
    it("accepts the Sprint 1 list item", () => {
      const valid = {
        id: "11111111-1111-4111-8111-111111111111",
        filename: "laporan.pdf",
        processingStatus: "completed" as const,
        createdAt: "2026-09-22T00:00:00.000Z",
      };
      expect(recentDocumentSchema.parse(valid)).toEqual(valid);
    });

    it("rejects tags and category on the Sprint 1 list item", () => {
      const parsed = recentDocumentSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        filename: "laporan.pdf",
        processingStatus: "queued",
        createdAt: "2026-09-22T00:00:00.000Z",
        tags: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Strategy",
            createdAt: "2026-09-25T03:00:00.000Z",
          },
        ],
        category: "Reporting",
      });
      expect(parsed).not.toHaveProperty("category");
    });
  });

  describe("recentDocumentListQuerySchema", () => {
    it("defaults a missing page and limit", () => {
      expect(recentDocumentListQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    });

    it("rejects a limit above 100", () => {
      expect(() => recentDocumentListQuerySchema.parse({ limit: "101" })).toThrow();
    });
  });

  describe("recentDocumentListResponseSchema", () => {
    it("accepts a paginated list of recent documents", () => {
      const valid = {
        success: true as const,
        data: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            filename: "laporan.pdf",
            processingStatus: "completed" as const,
            createdAt: "2026-09-22T00:00:00.000Z",
          },
        ],
        meta: { page: 1, limit: 20, total: 1 },
      };
      expect(recentDocumentListResponseSchema.parse(valid)).toEqual(valid);
    });

    it("rejects a list item that omits filename", () => {
      expect(() =>
        recentDocumentListResponseSchema.parse({
          success: true,
          data: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              processingStatus: "queued",
              createdAt: "2026-09-22T00:00:00.000Z",
            },
          ],
          meta: { page: 1, limit: 20, total: 1 },
        }),
      ).toThrow();
    });
  });

  describe("categorySummarySchema", () => {
    it("accepts valid category summary", () => {
      const valid = {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Reporting",
        slug: "reporting",
        downloadEnabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(categorySummarySchema.parse(valid)).toEqual(valid);
    });

    it("rejects invalid UUID or empty name", () => {
      expect(() =>
        categorySummarySchema.parse({
          id: "not-a-uuid",
          name: "",
          slug: "test",
          downloadEnabled: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      ).toThrow();
    });
  });

  describe("documentCategoryResponseSchema", () => {
    it("accepts valid category data or null", () => {
      const validWithCategory = {
        success: true,
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Reporting",
          slug: "reporting",
          downloadEnabled: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
      expect(documentCategoryResponseSchema.parse(validWithCategory)).toEqual(validWithCategory);

      const validWithNull = {
        success: true,
        data: null,
      };
      expect(documentCategoryResponseSchema.parse(validWithNull)).toEqual(validWithNull);
    });
  });

  describe("categoriesQuerySchema (Finding F8)", () => {
    it("defaults limit to CATEGORIES_DEFAULT_LIMIT (50)", () => {
      expect(categoriesQuerySchema.parse({})).toEqual({ limit: CATEGORIES_DEFAULT_LIMIT });
    });

    it("accepts valid custom limit within range [1, 100]", () => {
      expect(categoriesQuerySchema.parse({ limit: 1 })).toEqual({ limit: 1 });
      expect(categoriesQuerySchema.parse({ limit: "25" })).toEqual({ limit: 25 });
      expect(categoriesQuerySchema.parse({ limit: CATEGORIES_MAX_LIMIT })).toEqual({
        limit: CATEGORIES_MAX_LIMIT,
      });
    });

    it("rejects non-numeric limit, limit < 1, and limit > CATEGORIES_MAX_LIMIT", () => {
      expect(() => categoriesQuerySchema.parse({ limit: "invalid" })).toThrow();
      expect(() => categoriesQuerySchema.parse({ limit: 0 })).toThrow();
      expect(() => categoriesQuerySchema.parse({ limit: -5 })).toThrow();
      expect(() => categoriesQuerySchema.parse({ limit: CATEGORIES_MAX_LIMIT + 1 })).toThrow();
    });
  });

  describe("categoriesResponseSchema (Finding F8)", () => {
    it("accepts array of categories within bound", () => {
      const valid = {
        success: true,
        data: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Reporting",
            slug: "reporting",
            downloadEnabled: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };
      expect(categoriesResponseSchema.parse(valid)).toEqual(valid);
    });

    it("rejects response exceeding CATEGORIES_MAX_LIMIT (100)", () => {
      const oversized = {
        success: true,
        data: Array.from({ length: CATEGORIES_MAX_LIMIT + 1 }, (_, i) => ({
          id: "11111111-1111-4111-8111-111111111111",
          name: `Category ${i}`,
          slug: `category-${i}`,
          downloadEnabled: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })),
      };
      expect(() => categoriesResponseSchema.parse(oversized)).toThrow();
    });
  });

  describe("smartTagSchema", () => {
    it("accepts valid smart tag", () => {
      const tag = {
        id: "22222222-2222-4222-8222-222222222222",
        name: "finance",
        createdAt: new Date().toISOString(),
      };
      expect(smartTagSchema.parse(tag)).toEqual(tag);
    });

    it("rejects empty tag name", () => {
      expect(() =>
        smartTagSchema.parse({
          id: "22222222-2222-4222-8222-222222222222",
          name: "",
          createdAt: new Date().toISOString(),
        }),
      ).toThrow();
    });
  });

  describe("documentSmartTagsResponseSchema", () => {
    it("accepts valid response with up to 3 smart tags", () => {
      const response = {
        success: true,
        data: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "finance",
            createdAt: new Date().toISOString(),
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "strategy",
            createdAt: new Date().toISOString(),
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "legal",
            createdAt: new Date().toISOString(),
          },
        ],
      };
      expect(documentSmartTagsResponseSchema.parse(response)).toEqual(response);
    });

    it("accepts empty smart tags array", () => {
      const response = {
        success: true,
        data: [],
      };
      expect(documentSmartTagsResponseSchema.parse(response)).toEqual(response);
    });

    it("rejects response with more than 3 smart tags", () => {
      const response = {
        success: true,
        data: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "tag-1",
            createdAt: new Date().toISOString(),
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "tag-2",
            createdAt: new Date().toISOString(),
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "tag-3",
            createdAt: new Date().toISOString(),
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            name: "tag-4",
            createdAt: new Date().toISOString(),
          },
        ],
      };
      expect(() => documentSmartTagsResponseSchema.parse(response)).toThrow();
    });
  });

  describe("documentMetadataSchema", () => {
    it("accepts valid author and extractedAt", () => {
      const metadata = {
        author: "John Doe",
        extractedAt: new Date().toISOString(),
      };
      expect(documentMetadataSchema.parse(metadata)).toEqual(metadata);
    });

    it("accepts null author and extractedAt", () => {
      const metadata = {
        author: null,
        extractedAt: null,
      };
      expect(documentMetadataSchema.parse(metadata)).toEqual(metadata);
    });
  });

  describe("documentMetadataResultSchema", () => {
    it("accepts valid full metadata result payload", () => {
      const result = {
        id: "11111111-1111-4111-8111-111111111111",
        documentId: "22222222-2222-4222-8222-222222222222",
        author: "Arya Isnaidi",
        rawMetadata: { pageCount: 5, language: "id" },
        extractedAt: "2026-09-21T00:00:00.000Z",
        createdAt: "2026-09-21T00:00:00.000Z",
        updatedAt: "2026-09-21T00:00:00.000Z",
      };
      expect(documentMetadataResultSchema.parse(result)).toEqual(result);
    });

    it("accepts nullable author, rawMetadata, and extractedAt", () => {
      const result = {
        id: "11111111-1111-4111-8111-111111111111",
        documentId: "22222222-2222-4222-8222-222222222222",
        author: null,
        rawMetadata: null,
        extractedAt: null,
        createdAt: "2026-09-21T00:00:00.000Z",
        updatedAt: "2026-09-21T00:00:00.000Z",
      };
      expect(documentMetadataResultSchema.parse(result)).toEqual(result);
    });

    it("rejects invalid UUIDs", () => {
      const invalid = {
        id: "not-a-uuid",
        documentId: "22222222-2222-4222-8222-222222222222",
        author: "Test",
        extractedAt: "2026-09-21T00:00:00.000Z",
        createdAt: "2026-09-21T00:00:00.000Z",
        updatedAt: "2026-09-21T00:00:00.000Z",
      };
      expect(() => documentMetadataResultSchema.parse(invalid)).toThrow();
    });
  });

  describe("documentFileInfoSchema", () => {
    it("accepts valid file info", () => {
      const fileInfo = {
        id: "33333333-3333-4333-8333-333333333333",
        originalName: "laporan.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        fileExtension: "pdf",
        createdAt: new Date().toISOString(),
      };
      expect(documentFileInfoSchema.parse(fileInfo)).toEqual(fileInfo);
    });

    it("rejects negative file size", () => {
      expect(() =>
        documentFileInfoSchema.parse({
          id: "33333333-3333-4333-8333-333333333333",
          originalName: "laporan.pdf",
          mimeType: "application/pdf",
          fileSize: -1,
          fileExtension: "pdf",
          createdAt: new Date().toISOString(),
        }),
      ).toThrow();
    });
  });

  describe("documentSummarySchema and documentDetailSchema", () => {
    it("accepts valid document summary and detail", () => {
      const summary = {
        id: "44444444-4444-4444-8444-444444444444",
        title: "laporan.pdf",
        processingStatus: "queued" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(documentSummarySchema.parse(summary)).toEqual(summary);

      const detail = {
        ...summary,
        metadata: { author: "Finance Team", extractedAt: new Date().toISOString() },
        canDownload: false,
      };
      expect(documentDetailSchema.parse(detail)).toEqual(detail);
    });
  });
});
