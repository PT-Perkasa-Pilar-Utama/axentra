import { describe, expect, it } from "bun:test";
import {
  extractSmartTagsFromBuffer,
  MAX_SMART_TAGS_PER_DOCUMENT,
  normalizeTagName,
} from "./smart-tags.extractor";

describe("Smart Tags Extractor (Task BE-S2-01 / AC-04.02)", () => {
  describe("normalizeTagName", () => {
    it("lowercases and trims tags", () => {
      expect(normalizeTagName("  Strategy  ")).toBe("strategy");
      expect(normalizeTagName("FINANCE")).toBe("finance");
    });

    it("replaces spaces and punctuation with hyphens", () => {
      expect(normalizeTagName("Annual Report")).toBe("annual-report");
      expect(normalizeTagName("tax & audit")).toBe("tax-audit");
    });

    it("rejects stop words", () => {
      expect(normalizeTagName("and")).toBeNull();
      expect(normalizeTagName("dan")).toBeNull();
      expect(normalizeTagName("yang")).toBeNull();
      expect(normalizeTagName("pdf")).toBeNull();
      expect(normalizeTagName("docx")).toBeNull();
    });

    it("rejects pure numbers", () => {
      expect(normalizeTagName("2026")).toBeNull();
      expect(normalizeTagName("123")).toBeNull();
    });

    it("rejects strings shorter than 2 chars or longer than 50 chars", () => {
      expect(normalizeTagName("a")).toBeNull();
      expect(normalizeTagName("a".repeat(51))).toBeNull();
    });
  });

  describe("extractSmartTagsFromBuffer", () => {
    it("extracts known keywords from raw text content", () => {
      const rawText =
        "Laporan ini berisi strategi dan keuangan kuartal 4, disiapkan oleh tim legal.";
      const tags = extractSmartTagsFromBuffer(
        "dokumen.txt",
        "text/plain",
        new Uint8Array(),
        rawText,
      );

      expect(tags.length).toBeLessThanOrEqual(MAX_SMART_TAGS_PER_DOCUMENT);
      expect(tags).toContain("keuangan");
      expect(tags).toContain("legal");
      expect(tags).toContain("strategi");
    });

    it("extracts keywords from PDF Info dictionary", () => {
      const pdfString = "%PDF-1.4\n/Keywords (finance, strategy, reporting, overflow)\n";
      const buffer = new TextEncoder().encode(pdfString);
      const tags = extractSmartTagsFromBuffer("file.pdf", "application/pdf", buffer);

      expect(tags.length).toBe(3);
      expect(tags).toEqual(["finance", "strategy", "reporting"]);
    });

    it("extracts keywords from filename when no metadata keywords are present", () => {
      const tags = extractSmartTagsFromBuffer(
        "strategic-finance-compliance.pdf",
        "application/pdf",
        new Uint8Array(),
      );

      expect(tags.length).toBe(3);
      expect(tags).toEqual(["strategic", "finance", "compliance"]);
    });

    it("limits tags to at most 3 tags per document", () => {
      const rawText = "finance legal strategy reporting contract hr audit budget";
      const tags = extractSmartTagsFromBuffer("doc.txt", "text/plain", new Uint8Array(), rawText);

      expect(tags.length).toBe(3);
    });

    it("deduplicates tags across content and filename", () => {
      const rawText = "finance finance strategy strategy";
      const tags = extractSmartTagsFromBuffer(
        "finance.pdf",
        "application/pdf",
        new Uint8Array(),
        rawText,
      );

      expect(tags).toEqual(["finance", "strategy"]);
    });
  });
});
