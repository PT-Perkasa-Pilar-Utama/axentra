import { describe, expect, it } from "bun:test";
import { crc32 } from "node:zlib";
import {
  calculateZipArchiveSize,
  createZipArchive,
  deduplicateEntryNames,
  sanitizeZipEntryName,
  toDosDateTime,
  type ZipEntry,
} from "./zip.writer";
import { ZIP_ENTRY_NAME_MAX_BYTES } from "./zip.writer.helpers";
import { parseZipEntryNames } from "./documents.schema";
import { PayloadTooLargeError } from "../../http/errors";

const utf8 = new TextEncoder();

function utf8Length(value: string): number {
  return utf8.encode(value).byteLength;
}

/**
 * Reference ZIP archive builder used strictly within test fixtures
 * to verify byte-for-byte correctness of createZipArchive.
 */
function createReferenceZipArchive(
  entries: ReadonlyArray<ZipEntry>,
  archiveDate: Date = new Date(),
): Uint8Array {
  const uniqueEntries = deduplicateEntryNames(entries);
  const { time: dosTime, date: dosDate } = toDosDateTime(archiveDate);
  const textEncoder = new TextEncoder();

  type Prepared = {
    nameBytes: Uint8Array;
    content: Uint8Array;
    checksum: number;
    offset: number;
  };
  const prepared: Prepared[] = [];
  let currentOffset = 0;

  for (const entry of uniqueEntries) {
    const nameBytes = textEncoder.encode(entry.name);
    const checksum = crc32(entry.content);
    prepared.push({
      nameBytes,
      content: entry.content,
      checksum,
      offset: currentOffset,
    });
    currentOffset += 30 + nameBytes.length + entry.content.length;
  }

  const cdSize = prepared.reduce((sum, p) => sum + 46 + p.nameBytes.length, 0);
  const cd = new Uint8Array(cdSize);
  const cdView = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  let pos = 0;
  for (const p of prepared) {
    cdView.setUint32(pos, 0x02014b50, true);
    cdView.setUint16(pos + 4, 20, true);
    cdView.setUint16(pos + 6, 20, true);
    cdView.setUint16(pos + 8, 0x0800, true);
    cdView.setUint16(pos + 10, 0, true);
    cdView.setUint16(pos + 12, dosTime, true);
    cdView.setUint16(pos + 14, dosDate, true);
    cdView.setUint32(pos + 16, p.checksum, true);
    cdView.setUint32(pos + 20, p.content.length, true);
    cdView.setUint32(pos + 24, p.content.length, true);
    cdView.setUint16(pos + 28, p.nameBytes.length, true);
    cdView.setUint16(pos + 30, 0, true);
    cdView.setUint16(pos + 32, 0, true);
    cdView.setUint16(pos + 34, 0, true);
    cdView.setUint16(pos + 36, 0, true);
    cdView.setUint32(pos + 38, 0, true);
    cdView.setUint32(pos + 42, p.offset, true);
    cd.set(p.nameBytes, pos + 46);
    pos += 46 + p.nameBytes.length;
  }

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer, eocd.byteOffset, eocd.byteLength);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, prepared.length, true);
  eocdView.setUint16(10, prepared.length, true);
  eocdView.setUint32(12, cd.length, true);
  eocdView.setUint32(16, currentOffset, true);
  eocdView.setUint16(20, 0, true);

  const totalLength = currentOffset + cd.length + eocd.length;
  const result = new Uint8Array(totalLength);
  let writePos = 0;
  for (const p of prepared) {
    const prefix = new Uint8Array(30 + p.nameBytes.length);
    const view = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, p.checksum, true);
    view.setUint32(18, p.content.length, true);
    view.setUint32(22, p.content.length, true);
    view.setUint16(26, p.nameBytes.length, true);
    view.setUint16(28, 0, true);
    prefix.set(p.nameBytes, 30);

    result.set(prefix, writePos);
    writePos += prefix.length;
    result.set(p.content, writePos);
    writePos += p.content.length;
  }
  result.set(cd, writePos);
  writePos += cd.length;
  result.set(eocd, writePos);

  return result;
}

describe("zip.writer", () => {
  describe("toDosDateTime", () => {
    it("converts Date to valid DOS time and date integers", () => {
      const date = new Date(2026, 9, 19, 10, 30, 40); // 2026-10-19 10:30:40
      const { time, date: dosDate } = toDosDateTime(date);

      expect(time).toBeGreaterThan(0);
      expect(dosDate).toBeGreaterThan(0);

      // Verify hours = 10 (bits 11-15)
      const hours = (time >> 11) & 0x1f;
      expect(hours).toBe(10);

      // Verify year = 2026 - 1980 = 46 (bits 9-15)
      const yearOffset = (dosDate >> 9) & 0x7f;
      expect(yearOffset).toBe(46);
    });

    it("clamps dates prior to 1980 to 1980", () => {
      const oldDate = new Date(1970, 0, 1);
      const { date: dosDate } = toDosDateTime(oldDate);
      const yearOffset = (dosDate >> 9) & 0x7f;
      expect(yearOffset).toBe(0);
    });
  });

  describe("sanitizeZipEntryName", () => {
    it("strips POSIX path traversal (../../outside.pdf)", () => {
      expect(sanitizeZipEntryName("../../outside.pdf")).toBe("outside.pdf");
      expect(sanitizeZipEntryName("../../../secret.docx")).toBe("secret.docx");
    });

    it("strips Windows path traversal (..\\..\\outside.pdf)", () => {
      expect(sanitizeZipEntryName("..\\..\\outside.pdf")).toBe("outside.pdf");
      expect(sanitizeZipEntryName("..\\..\\..\\secret.docx")).toBe("secret.docx");
    });

    it("strips Windows drive letters and directories (C:\\Windows\\System32\\cmd.exe)", () => {
      expect(sanitizeZipEntryName("C:\\Windows\\System32\\cmd.exe")).toBe("cmd.exe");
      expect(sanitizeZipEntryName("D:/Documents/Reports/q1.pdf")).toBe("q1.pdf");
    });

    it("strips POSIX absolute paths (/etc/passwd)", () => {
      expect(sanitizeZipEntryName("/etc/passwd")).toBe("passwd");
      expect(sanitizeZipEntryName("/var/log/app.log")).toBe("app.log");
    });

    it("handles dot-only names gracefully by falling back to document", () => {
      expect(sanitizeZipEntryName("")).toBe("document");
      expect(sanitizeZipEntryName(".")).toBe("document");
      expect(sanitizeZipEntryName("..")).toBe("document");
      expect(sanitizeZipEntryName("   ")).toBe("document");
      expect(sanitizeZipEntryName("../../..")).toBe("document");
    });

    it("preserves legitimate spaces and unicode names", () => {
      expect(sanitizeZipEntryName("Laporan Keuangan Q1 2026.pdf")).toBe(
        "Laporan Keuangan Q1 2026.pdf",
      );
      expect(sanitizeZipEntryName("dokumen-rahasia_final.docx")).toBe("dokumen-rahasia_final.docx");
    });

    it("strips C0 control characters and DEL from the name (Round 1 F36)", () => {
      expect(sanitizeZipEntryName("lap\u0000or\u001fan\u007f.pdf")).toBe("laporan.pdf");
      expect(sanitizeZipEntryName("a\tb\nc\r.pdf")).toBe("abc.pdf");
    });

    it("falls back to document when only control characters remain (Round 1 F36)", () => {
      expect(sanitizeZipEntryName("\u0001\u0002\u007f")).toBe("document");
    });

    it("caps a long ASCII name at the byte limit and keeps the extension (Round 1 F36)", () => {
      const name = sanitizeZipEntryName(`${"a".repeat(400)}.pdf`);

      expect(utf8Length(name)).toBe(ZIP_ENTRY_NAME_MAX_BYTES);
      expect(name.endsWith(".pdf")).toBe(true);
    });

    it("caps a long multi-byte name without splitting a character (Round 1 F36)", () => {
      const name = sanitizeZipEntryName(`${"é".repeat(200)}.docx`);

      expect(utf8Length(name)).toBeLessThanOrEqual(ZIP_ENTRY_NAME_MAX_BYTES);
      expect(name.endsWith(".docx")).toBe(true);
      expect(name).not.toContain("�");
      expect(new TextDecoder("utf-8", { fatal: true }).decode(utf8.encode(name))).toBe(name);
    });
  });

  describe("deduplicateEntryNames", () => {
    it("appends incrementing index before extension for duplicate names", () => {
      const entries = [
        { name: "laporan.pdf" },
        { name: "laporan.pdf" },
        { name: "laporan.pdf" },
        { name: "berkas" },
        { name: "berkas" },
      ];
      const result = deduplicateEntryNames(entries);

      expect(result.map((r) => r.name)).toEqual([
        "laporan.pdf",
        "laporan (1).pdf",
        "laporan (2).pdf",
        "berkas",
        "berkas (1)",
      ]);
    });

    it("sanitizes names before deduplicating", () => {
      const entries = [{ name: "../../laporan.pdf" }, { name: "C:\\secret\\laporan.pdf" }];
      const result = deduplicateEntryNames(entries);

      expect(result.map((r) => r.name)).toEqual(["laporan.pdf", "laporan (1).pdf"]);
    });

    it("avoids collision when candidate name already exists", () => {
      const entries = [
        { name: "laporan.pdf" },
        { name: "laporan (1).pdf" },
        { name: "laporan.pdf" },
      ];
      const result = deduplicateEntryNames(entries);

      expect(result.map((r) => r.name)).toEqual([
        "laporan.pdf",
        "laporan (1).pdf",
        "laporan (2).pdf",
      ]);
    });

    it("keeps a deduplicated name of a capped entry within the byte limit (Round 1 F36)", () => {
      const longName = `${"b".repeat(300)}.pdf`;

      const result = deduplicateEntryNames([{ name: longName }, { name: longName }]);

      const [first, second] = result.map((r) => r.name);
      expect(utf8Length(first ?? "")).toBe(ZIP_ENTRY_NAME_MAX_BYTES);
      expect(utf8Length(second ?? "")).toBe(ZIP_ENTRY_NAME_MAX_BYTES);
      expect(second?.endsWith(" (1).pdf")).toBe(true);
      expect(second).not.toBe(first);
    });
  });

  describe("calculateZipArchiveSize", () => {
    it("computes exact archive length matching reference archive without loading content buffers", () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      const docxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

      const entries = [
        { name: "laporan.pdf", content: pdfBytes },
        { name: "laporan.pdf", content: pdfBytes },
        { name: "kontrak.docx", content: docxBytes },
      ];

      const fixedDate = new Date(2026, 9, 20, 10, 0, 0);
      const archive = createReferenceZipArchive(entries, fixedDate);

      const calculated = calculateZipArchiveSize([
        { name: "laporan.pdf", size: pdfBytes.length },
        { name: "laporan.pdf", size: pdfBytes.length },
        { name: "kontrak.docx", size: docxBytes.length },
      ]);

      expect(calculated).toBe(archive.length);
    });
  });

  describe("createZipArchive", () => {
    it("produces exact byte-for-byte archive matching reference archive", () => {
      const fixedDate = new Date(2026, 9, 20, 10, 0, 0);
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      const docxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

      const entries: Array<ZipEntry> = [
        { name: "laporan.pdf", content: pdfBytes },
        { name: "kontrak.docx", content: docxBytes },
      ];

      const archive = createZipArchive(entries, fixedDate);
      const reference = createReferenceZipArchive(entries, fixedDate);

      expect([...archive]).toEqual([...reference]);

      const names = parseZipEntryNames(archive);
      expect(names.size).toBe(2);
      expect(names.has("laporan.pdf")).toBe(true);
      expect(names.has("kontrak.docx")).toBe(true);
    });

    it("deduplicates entry names and preserves content", () => {
      const fixedDate = new Date(2026, 9, 20, 10, 0, 0);
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      const entries: Array<ZipEntry> = [
        { name: "laporan.pdf", content: pdfBytes },
        { name: "laporan.pdf", content: pdfBytes },
      ];

      const archive = createZipArchive(entries, fixedDate);
      const names = parseZipEntryNames(archive);
      expect(names.size).toBe(2);
      expect(names.has("laporan.pdf")).toBe(true);
      expect(names.has("laporan (1).pdf")).toBe(true);
    });

    it("writes a capped, control-free entry name into the 16-bit name fields (Round 1 F36)", () => {
      const rawName = `\u0007${"c".repeat(70_000)}.pdf`;
      const archive = createZipArchive([{ name: rawName, content: new Uint8Array([1, 2, 3]) }]);
      const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);

      const localNameLength = view.getUint16(26, true);
      const [entryName] = [...parseZipEntryNames(archive)];

      expect(localNameLength).toBe(ZIP_ENTRY_NAME_MAX_BYTES);
      expect(entryName).toBe(`${"c".repeat(ZIP_ENTRY_NAME_MAX_BYTES - 4)}.pdf`);
      expect(archive.byteLength).toBe(calculateZipArchiveSize([{ name: rawName, size: 3 }]));
    });

    it("throws PayloadTooLargeError when entry count exceeds ZIP32 limit (65,535)", () => {
      const dummyContent = new Uint8Array([1]);
      const entries = Array.from({ length: 65536 }, (_, i) => ({
        name: `doc_${i}.txt`,
        content: dummyContent,
      }));

      expect(() => createZipArchive(entries)).toThrow(PayloadTooLargeError);
    });

    it("throws PayloadTooLargeError when entry size exceeds ZIP32 limit (4 GiB)", () => {
      const largeContent = new Uint8Array(0);
      Object.defineProperty(largeContent, "byteLength", { value: 0x100000000 });
      const entries = [{ name: "oversized.bin", content: largeContent }];

      expect(() => createZipArchive(entries)).toThrow(PayloadTooLargeError);
    });
  });
});
