import { describe, expect, it } from "bun:test";

import {
  categorySummarySchema,
  documentDetailSchema,
  documentFileInfoSchema,
  documentMetadataResultSchema,
  documentMetadataSchema,
  documentSummarySchema,
  processingStatusSchema,
  recentDocumentListQuerySchema,
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
        tags: ["Strategy"],
        category: "Reporting",
      });
      expect(parsed).not.toHaveProperty("tags");
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
