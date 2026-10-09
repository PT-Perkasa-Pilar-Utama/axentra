import { describe, expect, it } from "bun:test";
import { buildConformingPdf, validateConformingPdf } from "./pdf-fixture";

describe("Conforming PDF Fixture Helper (Finding F16)", () => {
  it("generates a conforming PDF with valid 20-byte xref entries and metadata", () => {
    const pdf = buildConformingPdf({
      author: "Corporate Treasurer",
      title: "Finance Report",
      bodyText: "Laporan keuangan kas perseroan financial summary and budget ledger",
    });

    const validation = validateConformingPdf(pdf);
    expect(validation.objectCount).toBe(6);
    expect(validation.startXrefOffset).toBeGreaterThan(0);
  });

  it("generates a conforming PDF without optional metadata", () => {
    const pdf = buildConformingPdf({
      bodyText: "Dokumen tanpa metadata author",
    });

    const validation = validateConformingPdf(pdf);
    expect(validation.objectCount).toBe(5);
    expect(validation.startXrefOffset).toBeGreaterThan(0);
  });

  it("ensures each cross-reference entry is exactly 20 bytes long", () => {
    const pdf = buildConformingPdf({
      author: "Legal Counsel",
      bodyText: "Dokumen regulasi legal hukum dan kepatuhan perusahaan",
    });

    const buf = Buffer.from(pdf, "utf-8");
    const match = pdf.match(/startxref\n(\d+)\n%%EOF/);
    const startXrefStr = match?.[1];
    expect(startXrefStr).toBeDefined();
    const startXref = parseInt(startXrefStr ?? "0", 10);
    const xrefHeaderLen = Buffer.byteLength("xref\n0 6\n", "utf-8");
    const entriesStart = startXref + xrefHeaderLen;

    for (let i = 0; i < 6; i++) {
      const entrySlice = buf.subarray(entriesStart + i * 20, entriesStart + (i + 1) * 20);
      expect(entrySlice.length).toBe(20);
      expect(entrySlice.toString("utf-8").endsWith(" \n")).toBe(true);
    }
  });

  it("rejects undersized 19-byte cross-reference entries (F16 regression prevention)", () => {
    const validPdf = buildConformingPdf({
      bodyText: "Dokumen uji validasi",
    });

    // Simulate removing the trailing padding space (making entries 19 bytes)
    const malformedPdf = validPdf.replace(/([0-9]{5} [nf]) \n/g, "$1\n");
    expect(() => validateConformingPdf(malformedPdf)).toThrow();
  });

  it("rejects corrupted object offsets", () => {
    const validPdf = buildConformingPdf({
      bodyText: "Dokumen uji offset",
    });

    // Corrupt an object offset in the xref table
    const corruptedPdf = validPdf.replace("0000000009 00000 n \n", "0000099999 00000 n \n");
    expect(() => validateConformingPdf(corruptedPdf)).toThrow();
  });
});
