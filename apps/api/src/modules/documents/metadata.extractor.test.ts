import { describe, expect, it } from "bun:test";
import { deflateRawSync } from "node:zlib";
import { DeterministicMetadataExtractor } from "./metadata.extractor";

function createCompressedDocxArchive(
  entryName: string,
  xmlContent: string,
  overrideUncompressedSize?: number,
): Buffer {
  const xmlBuf = Buffer.from(xmlContent, "utf-8");
  const compressed = deflateRawSync(xmlBuf);
  const fnBuf = Buffer.from(entryName, "utf-8");

  // Local file header (30 bytes + name length)
  const localHeader = Buffer.alloc(30 + fnBuf.length);
  localHeader.writeUInt32LE(0x04034b50, 0); // signature
  localHeader.writeUInt16LE(20, 4); // version needed
  localHeader.writeUInt16LE(0, 6); // flags
  localHeader.writeUInt16LE(8, 8); // compression method: DEFLATE (8)
  localHeader.writeUInt16LE(0, 10); // time
  localHeader.writeUInt16LE(0, 12); // date
  localHeader.writeUInt32LE(0, 14); // crc-32 (placeholder)
  localHeader.writeUInt32LE(compressed.length, 18); // compressed size
  localHeader.writeUInt32LE(overrideUncompressedSize ?? xmlBuf.length, 22); // uncompressed size
  localHeader.writeUInt16LE(fnBuf.length, 26); // filename length
  localHeader.writeUInt16LE(0, 28); // extra field length
  fnBuf.copy(localHeader, 30);

  const localOffset = 0;
  const cdOffset = localHeader.length + compressed.length;

  // Central directory header (46 bytes + name length)
  const cdHeader = Buffer.alloc(46 + fnBuf.length);
  cdHeader.writeUInt32LE(0x02014b50, 0); // signature
  cdHeader.writeUInt16LE(20, 4); // version made by
  cdHeader.writeUInt16LE(20, 6); // version needed
  cdHeader.writeUInt16LE(0, 8); // flags
  cdHeader.writeUInt16LE(8, 10); // compression method: DEFLATE (8)
  cdHeader.writeUInt16LE(0, 12); // time
  cdHeader.writeUInt16LE(0, 14); // date
  cdHeader.writeUInt32LE(0, 16); // crc-32
  cdHeader.writeUInt32LE(compressed.length, 20); // compressed size
  cdHeader.writeUInt32LE(overrideUncompressedSize ?? xmlBuf.length, 24); // uncompressed size
  cdHeader.writeUInt16LE(fnBuf.length, 28); // filename length
  cdHeader.writeUInt16LE(0, 30); // extra length
  cdHeader.writeUInt16LE(0, 32); // comment length
  cdHeader.writeUInt16LE(0, 34); // disk start
  cdHeader.writeUInt16LE(0, 36); // int attr
  cdHeader.writeUInt32LE(0, 38); // ext attr
  cdHeader.writeUInt32LE(localOffset, 42); // relative offset of local header
  fnBuf.copy(cdHeader, 46);

  // End of Central Directory record (EOCD - 22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // cd disk number
  eocd.writeUInt16LE(1, 8); // cd records on disk
  eocd.writeUInt16LE(1, 10); // total cd records
  eocd.writeUInt32LE(cdHeader.length, 12); // cd size
  eocd.writeUInt32LE(cdOffset, 16); // cd offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localHeader, compressed, cdHeader, eocd]);
}

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

  it("extracts author from compressed OOXML DOCX archive with DEFLATE docProps/core.xml", () => {
    const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:creator>Siti Rahma</dc:creator>
</cp:coreProperties>`;
    const buffer = createCompressedDocxArchive("docProps/core.xml", coreXml);

    const result = extractor.extract({
      documentId: "22222222-2222-4222-8222-222222222222",
      filename: "dokumen.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer,
    });

    expect(result.author).toBe("Siti Rahma");
    expect(result.rawMetadata.method).toBe("docx_xml_core");
  });

  it("extracts lastModifiedBy from compressed DOCX when dc:creator is missing", () => {
    const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties">
  <cp:lastModifiedBy>Dewi Sartika</cp:lastModifiedBy>
</cp:coreProperties>`;
    const buffer = createCompressedDocxArchive("docProps/core.xml", coreXml);

    const result = extractor.extract({
      documentId: "22222222-2222-4222-8222-222222222223",
      filename: "dokumen-modified.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer,
    });

    expect(result.author).toBe("Dewi Sartika");
    expect(result.rawMetadata.method).toBe("docx_xml_core");
  });

  it("returns null author when DOCX archive does not contain docProps/core.xml", () => {
    const documentXml = `<?xml version="1.0" encoding="UTF-8"?><w:document><w:body><w:p/></w:body></w:document>`;
    const buffer = createCompressedDocxArchive("word/document.xml", documentXml);

    const result = extractor.extract({
      documentId: "22222222-2222-4222-8222-222222222224",
      filename: "no-core-props.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer,
    });

    expect(result.author).toBeNull();
    expect(result.rawMetadata.detected).toBe(false);
  });

  it("safely handles corrupted or truncated ZIP buffer without crashing", () => {
    const corruptBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    const result = extractor.extract({
      documentId: "22222222-2222-4222-8222-222222222225",
      filename: "corrupt.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: corruptBuffer,
    });

    expect(result.author).toBeNull();
    expect(result.rawMetadata.detected).toBe(false);
  });

  it("enforces safe resource limits against zip bombs exceeding 512 KiB uncompressed size", () => {
    const smallXml = `<cp:coreProperties><dc:creator>Attacker</dc:creator></cp:coreProperties>`;
    // Lie in the header that uncompressed size is 10 MB (> 512 KiB)
    const buffer = createCompressedDocxArchive("docProps/core.xml", smallXml, 10 * 1024 * 1024);

    const result = extractor.extract({
      documentId: "22222222-2222-4222-8222-222222222226",
      filename: "zip-bomb.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer,
    });

    expect(result.author).toBeNull();
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
