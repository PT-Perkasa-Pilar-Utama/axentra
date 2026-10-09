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
    expect(validation.info?.author).toBe("Corporate Treasurer");
    expect(validation.info?.title).toBe("Finance Report");
  });

  it("generates a conforming PDF without optional metadata", () => {
    const pdf = buildConformingPdf({
      bodyText: "Dokumen tanpa metadata author",
    });

    const validation = validateConformingPdf(pdf);
    expect(validation.objectCount).toBe(5);
    expect(validation.startXrefOffset).toBeGreaterThan(0);
    expect(validation.info).toBeUndefined();
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

  it("strictly enforces %PDF-1.4 header requirement (Finding F17)", () => {
    const validPdf = buildConformingPdf({
      bodyText: "Dokumen uji header",
    });

    // Test rejection of older version (%PDF-1.3)
    const pdf13 = validPdf.replace("%PDF-1.4\n", "%PDF-1.3\n");
    expect(() => validateConformingPdf(pdf13)).toThrow("expected '%PDF-1.4'");

    // Test rejection of non-conforming header
    const nonPdf = validPdf.replace("%PDF-1.4\n", "%PDF-2.0\n");
    expect(() => validateConformingPdf(nonPdf)).toThrow("expected '%PDF-1.4'");

    // Test rejection of completely missing header
    const missingHeader = validPdf.replace("%PDF-1.4\n", "");
    expect(() => validateConformingPdf(missingHeader)).toThrow();
  });

  it("rejects unanchored %%EOF or trailing bytes after %%EOF (Finding F17)", () => {
    const validPdf = buildConformingPdf({
      bodyText: "Dokumen uji trailing bytes",
    });

    // Trailing garbage after %%EOF marker
    const corruptedPdfWithTrailing = `${validPdf}trailing garbage bytes`;
    expect(() => validateConformingPdf(corruptedPdfWithTrailing)).toThrow(
      "unexpected trailing bytes after %%EOF",
    );

    // Trailing newline followed by extra comment
    const corruptedWithComment = `${validPdf}% additional appended data\n`;
    expect(() => validateConformingPdf(corruptedWithComment)).toThrow(
      "unexpected trailing bytes after %%EOF",
    );
  });

  it("validates trailer dictionary integrity and metadata object (Finding F17)", () => {
    const validPdf = buildConformingPdf({
      author: "Legal Dept",
      title: "Contract Agreement",
      bodyText: "Isi dokumen kontrak",
    });

    // Reject trailer referencing non-existent Info object
    const nonExistentInfoPdf = validPdf.replace("/Info 5 0 R", "/Info 99 0 R");
    expect(() => validateConformingPdf(nonExistentInfoPdf)).toThrow(
      "references object 99 which is not in xref table",
    );

    // Reject trailer missing /Root
    const missingRootPdf = validPdf.replace(/\/Root \d+ 0 R/, "");
    expect(() => validateConformingPdf(missingRootPdf)).toThrow("missing required /Root");

    // Reject trailer with /Size mismatch
    const badSizePdf = validPdf.replace("/Size 6", "/Size 99");
    expect(() => validateConformingPdf(badSizePdf)).toThrow("does not match xref count");

    // Reject malformed /Info object (not formatted as a valid << >> dictionary)
    const corruptedInfoPdf = validPdf.replace("5 0 obj\n<<", "5 0 obj\n--");
    expect(() => validateConformingPdf(corruptedInfoPdf)).toThrow(
      "Malformed metadata Info object 5",
    );
  });

  it("correctly parses byte offsets and validates fixtures containing multibyte UTF-8 characters (Finding F20)", () => {
    const multibyteAuthor = "Müller & François — Lead Auditor";
    const multibyteTitle = "Rekapitulasi © 2026 — Laporan Keuangan";
    const multibyteBody =
      "Dokumen uji dengan karakter multibyte UTF-8: — © 日本語 🎉 dan aksen Bahasa Indonesia.";

    const pdfString = buildConformingPdf({
      author: multibyteAuthor,
      title: multibyteTitle,
      bodyText: multibyteBody,
    });

    // 1. Validate when passed as a string
    const resultFromString = validateConformingPdf(pdfString);
    expect(resultFromString.objectCount).toBe(6);
    expect(resultFromString.startXrefOffset).toBeGreaterThan(0);
    expect(resultFromString.info?.author).toBe(multibyteAuthor);
    expect(resultFromString.info?.title).toBe(multibyteTitle);

    // 2. Validate when passed as Uint8Array bytes
    const pdfBytes = Buffer.from(pdfString, "utf-8");
    const resultFromBytes = validateConformingPdf(pdfBytes);
    expect(resultFromBytes.objectCount).toBe(6);
    expect(resultFromBytes.startXrefOffset).toBe(resultFromString.startXrefOffset);
    expect(resultFromBytes.info?.author).toBe(multibyteAuthor);
    expect(resultFromBytes.info?.title).toBe(multibyteTitle);
  });
});
