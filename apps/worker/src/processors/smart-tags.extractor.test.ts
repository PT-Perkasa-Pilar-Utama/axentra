import { describe, expect, it } from "bun:test";
import { deflateRawSync } from "node:zlib";
import {
  extractSmartTagsFromBuffer,
  MAX_SMART_TAGS_PER_DOCUMENT,
  normalizeTagName,
} from "./smart-tags.extractor";
import { extractDocumentBodyText } from "./document-text.extractor";

function createCompressedDocxWithDocumentXml(documentXml: string): Buffer {
  const xmlBuf = Buffer.from(documentXml, "utf-8");
  const compressed = deflateRawSync(xmlBuf);
  const fnBuf = Buffer.from("word/document.xml", "utf-8");

  const localHeader = Buffer.alloc(30 + fnBuf.length);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(8, 8); // DEFLATE
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(xmlBuf.length, 22);
  localHeader.writeUInt16LE(fnBuf.length, 26);
  localHeader.writeUInt16LE(0, 28);
  fnBuf.copy(localHeader, 30);

  const localOffset = 0;
  const cdOffset = localHeader.length + compressed.length;

  const cdHeader = Buffer.alloc(46 + fnBuf.length);
  cdHeader.writeUInt32LE(0x02014b50, 0);
  cdHeader.writeUInt16LE(20, 4);
  cdHeader.writeUInt16LE(20, 6);
  cdHeader.writeUInt16LE(0, 8);
  cdHeader.writeUInt16LE(8, 10);
  cdHeader.writeUInt32LE(compressed.length, 20);
  cdHeader.writeUInt32LE(xmlBuf.length, 24);
  cdHeader.writeUInt16LE(fnBuf.length, 28);
  cdHeader.writeUInt16LE(0, 30);
  cdHeader.writeUInt16LE(0, 32);
  cdHeader.writeUInt16LE(0, 34);
  cdHeader.writeUInt16LE(0, 36);
  cdHeader.writeUInt32LE(0, 38);
  cdHeader.writeUInt32LE(localOffset, 42);
  fnBuf.copy(cdHeader, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdHeader.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localHeader, compressed, cdHeader, eocd]);
}

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

    it("extracts keywords from filename when no body or metadata keywords are present", () => {
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

    it("extracts smart tags from realistic DOCX body text where filename has no keywords (F1)", () => {
      const docxBodyXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>This internal document reviews the fiscal budget allocation and</w:t></w:r>
      <w:r><w:t> procurement guidelines following our operational audit.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;
      const buffer = createCompressedDocxWithDocumentXml(docxBodyXml);

      // Verify text extraction directly
      const extractedText = extractDocumentBodyText(
        "doc-9812.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer,
      );
      expect(extractedText).toContain("budget");
      expect(extractedText).toContain("procurement");
      expect(extractedText).toContain("audit");

      // Verify smart tags extractor extracts keywords from body, NOT filename
      const tags = extractSmartTagsFromBuffer(
        "doc-9812.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer,
      );

      expect(tags.length).toBe(3);
      expect(tags).toContain("audit");
      expect(tags).toContain("budget");
      expect(tags).toContain("procurement");
      expect(tags).not.toContain("doc");
    });

    it("extracts smart tags from realistic PDF content stream where filename has no keywords (F1)", () => {
      const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 120 >>
stream
BT
/F1 12 Tf
72 712 Td
(The company legal contract compliance guidelines are detailed in this section.) Tj
ET
endstream
endobj
xref
0 5
trailer
<< /Root 1 0 R >>
%%EOF`;
      const buffer = Buffer.from(pdfContent, "latin1");

      const tags = extractSmartTagsFromBuffer("scan-doc-0001.pdf", "application/pdf", buffer);

      expect(tags.length).toBe(3);
      expect(tags).toContain("legal");
      expect(tags).toContain("contract");
      expect(tags).toContain("compliance");
      expect(tags).not.toContain("scan");
    });

    it("prioritizes body content keywords over filename tokens (F1)", () => {
      const pdfContent = `%PDF-1.4
1 0 obj
<< /Length 80 >>
stream
BT
/F1 12 Tf
(This report covers tax and audit procedures.) Tj
ET
endstream
endobj
trailer
<< /Root 1 0 R >>
%%EOF`;
      const buffer = Buffer.from(pdfContent, "latin1");

      // Filename contains "marketing" and "operations"
      const tags = extractSmartTagsFromBuffer(
        "marketing-operations.pdf",
        "application/pdf",
        buffer,
      );

      // Body keywords ("tax", "audit") must appear first, filename fills remaining slot
      expect(tags.length).toBe(3);
      expect(tags[0]).toBe("tax");
      expect(tags[1]).toBe("audit");
      expect(tags[2]).toBe("marketing");
    });
  });
});
