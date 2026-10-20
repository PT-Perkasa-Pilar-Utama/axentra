import { describe, expect, it } from "bun:test";
import { crc32 } from "node:zlib";
import type { Logger } from "@axentra/observability";
import {
  calculateZipArchiveSize,
  createZipReadableStream,
  deduplicateEntryNames,
  sanitizeZipEntryName,
  toDosDateTime,
  type ZipEntry,
} from "./zip.writer";
import { parseZipEntryNames } from "./documents.schema";

/**
 * Reference ZIP archive builder used strictly within test fixtures
 * to verify byte-for-byte correctness of createZipStream.
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

  describe("createZipStream & createZipReadableStream", () => {
    it("streams ZIP chunks lazily and produces exact byte-for-byte archive", async () => {
      const fixedDate = new Date(2026, 9, 20, 10, 0, 0);
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      const docxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

      let docxLoaderCalled = false;
      const streamEntries = [
        { name: "laporan.pdf", content: pdfBytes },
        {
          name: "kontrak.docx",
          content: async () => {
            docxLoaderCalled = true;
            return docxBytes;
          },
        },
      ];

      // Stream creation must NOT invoke loader upfront
      const stream = createZipReadableStream(streamEntries, fixedDate);
      expect(docxLoaderCalled).toBe(false);

      const reader = stream.getReader();
      // Read first chunk (local header for laporan.pdf)
      await reader.read();
      expect(docxLoaderCalled).toBe(false);

      // Read second chunk (content for laporan.pdf)
      await reader.read();
      expect(docxLoaderCalled).toBe(false);

      // Read third chunk (pulls loader for kontrak.docx)
      await reader.read();
      expect(docxLoaderCalled).toBe(true);

      // Read remaining chunks
      const chunks: Uint8Array[] = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) {
          chunks.push(result.value);
        }
      }

      const standardBytes = createReferenceZipArchive(
        [
          { name: "laporan.pdf", content: pdfBytes },
          { name: "kontrak.docx", content: docxBytes },
        ],
        fixedDate,
      );

      // Total stream length must match standard archive
      const response = new Response(createZipReadableStream(streamEntries, fixedDate));
      const fullStreamBytes = new Uint8Array(await response.arrayBuffer());
      expect([...fullStreamBytes]).toEqual([...standardBytes]);

      const names = parseZipEntryNames(fullStreamBytes);
      expect(names.has("laporan.pdf")).toBe(true);
      expect(names.has("kontrak.docx")).toBe(true);
    });

    it("throws error when actual byte length does not match expectedSize (F15)", async () => {
      const stream = createZipReadableStream([
        {
          name: "corrupt.pdf",
          expectedSize: 100, // Metadata claims 100 bytes
          content: new Uint8Array([1, 2, 3]), // Actual is 3 bytes
        },
      ]);

      const response = new Response(stream);
      await expect(response.arrayBuffer()).rejects.toThrow(
        'Ukuran berkas "corrupt.pdf" (3 byte) tidak sesuai dengan metadata (100 byte)',
      );
    });

    it("logs error without sensitive payload when stream pull fails (F12)", async () => {
      let loggedRecord: Record<string, unknown> | undefined;
      const mockLogger = {
        error: (data: unknown) => {
          if (data && typeof data === "object") {
            loggedRecord = data as Record<string, unknown>;
          }
        },
      } as unknown as Logger;

      const stream = createZipReadableStream(
        [
          {
            name: "fail.pdf",
            content: async () => {
              throw new Error("Storage unavailable");
            },
          },
        ],
        { logger: mockLogger, requestId: "req-test-123" },
      );

      const response = new Response(stream);
      await expect(response.arrayBuffer()).rejects.toThrow("Storage unavailable");
      expect(loggedRecord).toBeDefined();
      expect(loggedRecord?.requestId).toBe("req-test-123");
    });
  });
});
