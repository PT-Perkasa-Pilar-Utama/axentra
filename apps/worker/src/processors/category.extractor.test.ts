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
    it("assigns Reporting category from content text per AC-05.01", () => {
      const content =
        "Dokumen ini merupakan laporan kinerja bulanan divisi teknis untuk Reporting Q3.";
      const category = extractCategoryFromBuffer("doc1.txt", "text/plain", dummyBuffer, content);

      expect(category).not.toBeNull();
      expect(category?.name).toBe("Reporting");
      expect(category?.slug).toBe("reporting");
    });

    it("assigns Contract category from content text per AC-05.02", () => {
      const content = "Surat perjanjian kerja sama atau Contract vendor pengadaan barang.";
      const category = extractCategoryFromBuffer("doc2.txt", "text/plain", dummyBuffer, content);

      expect(category).not.toBeNull();
      expect(category?.name).toBe("Contract");
      expect(category?.slug).toBe("contract");
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
