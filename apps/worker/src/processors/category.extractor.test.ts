import { describe, expect, it } from "bun:test";
import { extractCategoryFromBuffer, slugifyCategory } from "./category.extractor";

describe("category.extractor", () => {
  const dummyBuffer = new Uint8Array([1, 2, 3]);

  describe("slugifyCategory", () => {
    it("converts mixed case and spaces to kebab-case slug", () => {
      expect(slugifyCategory("Reporting")).toBe("reporting");
      expect(slugifyCategory("Human Resources")).toBe("human-resources");
      expect(slugifyCategory("Contract & Agreement")).toBe("contract-agreement");
    });
  });

  describe("extractCategoryFromBuffer", () => {
    it("assigns Reporting category from actual PDF buffer content using neutral filename per AC-05.01", () => {
      const reportingPdf = `%PDF-1.4
1 0 obj
<< /Length 80 >>
stream
BT
/F1 12 Tf
(Dokumen ini menyajikan data Reporting tahunan organisasi dan evaluasi Reporting.) Tj
ET
endstream
endobj
%%EOF`;
      const pdfBuffer = Buffer.from(reportingPdf, "latin1");

      // Test with neutral filename that cannot trigger filename fallback
      const category = extractCategoryFromBuffer(
        "doc-sample-101.pdf",
        "application/pdf",
        pdfBuffer,
      );

      expect(category).not.toBeNull();
      expect(category?.name).toBe("Reporting");
      expect(category?.slug).toBe("reporting");
    });

    it("assigns Contract category from actual PDF buffer content using neutral filename per AC-05.02", () => {
      const contractPdf = `%PDF-1.4
1 0 obj
<< /Length 80 >>
stream
BT
/F1 12 Tf
(Dokumen resmi Contract kemitraan strategis dan pasal Contract kerja sama.) Tj
ET
endstream
endobj
%%EOF`;
      const pdfBuffer = Buffer.from(contractPdf, "latin1");

      // Test with neutral filename that cannot trigger filename fallback
      const category = extractCategoryFromBuffer(
        "doc-sample-102.pdf",
        "application/pdf",
        pdfBuffer,
      );

      expect(category).not.toBeNull();
      expect(category?.name).toBe("Contract");
      expect(category?.slug).toBe("contract");
    });

    it("ensures extracted PDF content takes precedence over contradictory filename", () => {
      const reportingPdf = `%PDF-1.4
1 0 obj
<< /Length 80 >>
stream
BT
/F1 12 Tf
(Reporting berkala dan evaluasi Reporting performa departemen.) Tj
ET
endstream
endobj
%%EOF`;
      const pdfBuffer = Buffer.from(reportingPdf, "latin1");

      // Filename mentions 'finance' but actual PDF content has 'Reporting'
      const category = extractCategoryFromBuffer("finance-notes.pdf", "application/pdf", pdfBuffer);

      expect(category).not.toBeNull();
      expect(category?.name).toBe("Reporting");
      expect(category?.slug).toBe("reporting");
    });

    it("assigns category with highest keyword frequency in content", () => {
      const content =
        "Reporting tahunan penting. Setiap Reporting wajib diperiksa. finance disebutkan sekali.";
      const category = extractCategoryFromBuffer("report.txt", "text/plain", dummyBuffer, content);

      expect(category?.name).toBe("Reporting");
    });

    it("falls back to filename when content has no recognized category keywords", () => {
      const emptyContent = "Lorem ipsum dolor sit amet.";
      const category = extractCategoryFromBuffer(
        "laporan-keuangan-2026.pdf",
        "application/pdf",
        dummyBuffer,
        emptyContent,
      );

      expect(category).not.toBeNull();
      expect(["Reporting", "Finance"]).toContain(category?.name ?? "");
    });

    it("matches dynamic existing categories passed to extractor", () => {
      const content = "Pembahasan mendalam tentang Project Titan untuk tim engineering.";
      const existing = [{ name: "Project Titan", slug: "project-titan" }];
      const category = extractCategoryFromBuffer(
        "notes.txt",
        "text/plain",
        dummyBuffer,
        content,
        existing,
      );

      expect(category).not.toBeNull();
      expect(category?.name).toBe("Project Titan");
      expect(category?.slug).toBe("project-titan");
    });

    it("returns null when no category can be detected from content or filename", () => {
      const content = "random text xyz without any meaningful category words";
      const category = extractCategoryFromBuffer(
        "abc12345.bin",
        "application/octet-stream",
        dummyBuffer,
        content,
      );

      expect(category).toBeNull();
    });
  });
});
