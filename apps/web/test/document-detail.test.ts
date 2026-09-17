import { describe, expect, test } from "bun:test";
import { documentMetadataSchema } from "@axentra/shared";

describe("document-detail metadata verification (AC-03.01)", () => {
  test("AC-03.01: parses extracted author metadata for processed document", () => {
    const rawData = {
      id: "doc-123",
      filename: "laporan.pdf",
      author: "Bessie Cooper",
      format: "PDF",
      sizeBytes: 2048000,
      tags: ["Strategy", "AI", "Data Science"],
      category: "Report",
      uploadDate: "16/12/2025",
      processingStatus: "processed",
    };

    const parsed = documentMetadataSchema.safeParse(rawData);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.author).toBe("Bessie Cooper");
      expect(parsed.data.processingStatus).toBe("processed");
      expect(parsed.data.filename).toBe("laporan.pdf");
      expect(parsed.data.tags).toEqual(["Strategy", "AI", "Data Science"]);
    }
  });

  test("AC-03.01: handles document with null author gracefully", () => {
    const rawData = {
      id: "doc-456",
      filename: "dokumen-tanpa-penulis.pdf",
      author: null,
      processingStatus: "processed",
    };

    const parsed = documentMetadataSchema.safeParse(rawData);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.author).toBeNull();
    }
  });

  test("validates processing status states", () => {
    const validStatuses = ["queued", "processing", "processed", "failed"];
    for (const status of validStatuses) {
      const parsed = documentMetadataSchema.safeParse({
        id: "doc-test",
        filename: "test.pdf",
        processingStatus: status,
      });
      expect(parsed.success).toBe(true);
    }
  });
});
