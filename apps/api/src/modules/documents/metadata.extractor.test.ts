import { describe, expect, it } from "bun:test";
import { DeterministicMetadataExtractor } from "./metadata.extractor";

describe("DeterministicMetadataExtractor (Task BE-S1-05 / AC-03.01)", () => {
  const extractor = new DeterministicMetadataExtractor();

  it("extracts author from PDF buffer with /Author info dictionary tag", () => {
    const pdfContent = `%PDF-1.4\n1 0 obj\n<< /Title (Laporan Keuangan) /Author (Ahmad Yani) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`;
    const buffer = Buffer.from(pdfContent, "utf-8");

    const result = extractor.extract({
      documentId: "11111111-1111-4111-8111-111111111111",
      filename: "laporan.pdf",
      mimeType: "application/pdf",
      buffer,
    });

    expect(result.author).toBe("Ahmad Yani");
    expect(result.rawMetadata.extractor).toBe("deterministic-placeholder");
    expect(result.rawMetadata.method).toBe("pdf_info_dict");
    expect(result.extractedAt).toBeInstanceOf(Date);
  });

  it("extracts author from DOCX buffer with dc:creator xml tag", () => {
    const docxXmlSample = `PK\x03\x04<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Siti Rahma</dc:creator></cp:coreProperties>`;
    const buffer = Buffer.from(docxXmlSample, "latin1");

    const result = extractor.extract({
      documentId: "22222222-2222-4222-8222-222222222222",
      filename: "dokumen.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer,
    });

    expect(result.author).toBe("Siti Rahma");
    expect(result.rawMetadata.method).toBe("docx_xml_core");
  });

  it("extracts author from rawText pattern 'Penulis: <name>'", () => {
    const text = "LAPORAN TAHUNAN 2026\nPenulis: Budi Santoso\nDivisi: Keuangan";
    const result = extractor.extract({
      documentId: "33333333-3333-4333-8333-333333333333",
      filename: "dokumen.pdf",
      rawText: text,
    });

    expect(result.author).toBe("Budi Santoso");
    expect(result.rawMetadata.method).toBe("text_pattern");
  });

  it("extracts author from filename with 'by-<name>' or 'penulis-<name>'", () => {
    const result = extractor.extract({
      documentId: "44444444-4444-4444-8444-444444444444",
      filename: "laporan-tahunan-by-joko-widodo.pdf",
      mimeType: "application/pdf",
    });

    expect(result.author).toBe("Joko Widodo");
    expect(result.rawMetadata.method).toBe("filename_pattern");
  });

  it("respects explicit authorOverrides from options", () => {
    const customExtractor = new DeterministicMetadataExtractor({
      authorOverrides: {
        "55555555-5555-4555-8555-555555555555": "Dr. H. Bambang",
      },
    });

    const result = customExtractor.extract({
      documentId: "55555555-5555-4555-8555-555555555555",
      filename: "anonim.pdf",
      mimeType: "application/pdf",
    });

    expect(result.author).toBe("Dr. H. Bambang");
    expect(result.rawMetadata.method).toBe("override");
  });

  it("returns null author and detected=false when no author can be found", () => {
    const emptyPdf = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Title (Dokumen Tanpa Penulis) >>\nendobj\n%%EOF",
    );
    const result = extractor.extract({
      documentId: "66666666-6666-4666-8666-666666666666",
      filename: "laporan-kosong.pdf",
      mimeType: "application/pdf",
      buffer: emptyPdf,
    });

    expect(result.author).toBeNull();
    expect(result.rawMetadata.detected).toBe(false);
  });
});
