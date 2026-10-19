import { describe, expect, it } from "bun:test";
import { crc32 } from "node:zlib";
import {
  createZipArchive,
  deduplicateEntryNames,
  toDosDateTime,
  type ZipEntry,
} from "./zip.writer";
import { parseZipEntryNames } from "./documents.schema";

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

  describe("deduplicateEntryNames", () => {
    it("leaves unique filenames unchanged", () => {
      const entries: ZipEntry[] = [
        { name: "doc1.pdf", content: new Uint8Array([1]) },
        { name: "doc2.docx", content: new Uint8Array([2]) },
      ];
      const result = deduplicateEntryNames(entries);
      expect(result.map((r) => r.name)).toEqual(["doc1.pdf", "doc2.docx"]);
    });

    it("deduplicates collision filenames by appending (1), (2)", () => {
      const entries: ZipEntry[] = [
        { name: "laporan.pdf", content: new Uint8Array([1]) },
        { name: "laporan.pdf", content: new Uint8Array([2]) },
        { name: "laporan.pdf", content: new Uint8Array([3]) },
      ];
      const result = deduplicateEntryNames(entries);
      expect(result.map((r) => r.name)).toEqual([
        "laporan.pdf",
        "laporan (1).pdf",
        "laporan (2).pdf",
      ]);
    });

    it("handles files without extension gracefully", () => {
      const entries: ZipEntry[] = [
        { name: "README", content: new Uint8Array([1]) },
        { name: "README", content: new Uint8Array([2]) },
      ];
      const result = deduplicateEntryNames(entries);
      expect(result.map((r) => r.name)).toEqual(["README", "README (1)"]);
    });
  });

  describe("createZipArchive", () => {
    it("creates a valid empty zip archive when entries array is empty", () => {
      const zip = createZipArchive([]);
      expect(zip.length).toBe(22); // Empty EOCD record
      const names = parseZipEntryNames(zip);
      expect(names.size).toBe(0);
    });

    it("creates a valid zip archive with single file and correct headers", () => {
      const content = new TextEncoder().encode("Hello world content");
      const zip = createZipArchive([{ name: "test.txt", content }]);

      expect(zip.length).toBeGreaterThan(content.length);

      // Verify PK\x03\x04 signature at offset 0
      const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
      expect(view.getUint32(0, true)).toBe(0x04034b50);

      // Verify CRC in local header
      const expectedCrc = crc32(content);
      expect(view.getUint32(14, true)).toBe(expectedCrc);

      // Verify entries can be read by parseZipEntryNames
      const names = parseZipEntryNames(zip);
      expect(names.has("test.txt")).toBe(true);
    });

    it("creates a valid zip archive with multiple files including duplicate filenames", () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      const docxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

      const entries: ZipEntry[] = [
        { name: "laporan.pdf", content: pdfBytes },
        { name: "laporan.pdf", content: pdfBytes },
        { name: "kontrak.docx", content: docxBytes },
      ];

      const zip = createZipArchive(entries);
      const names = parseZipEntryNames(zip);

      expect(names.size).toBe(3);
      expect(names.has("laporan.pdf")).toBe(true);
      expect(names.has("laporan (1).pdf")).toBe(true);
      expect(names.has("kontrak.docx")).toBe(true);
    });
  });
});
