import { crc32 } from "node:zlib";
import type { Logger } from "@axentra/observability";
import { summarizeError } from "@axentra/observability";
import {
  deduplicateEntryNames,
  toDosDateTime,
  ZIP32_MAX_ARCHIVE_SIZE,
  ZIP32_MAX_ENTRY_COUNT,
  ZIP32_MAX_ENTRY_SIZE,
} from "./zip.writer.helpers";

export {
  deduplicateEntryNames,
  sanitizeZipEntryName,
  toDosDateTime,
  ZIP32_MAX_ARCHIVE_SIZE,
  ZIP32_MAX_ENTRY_COUNT,
  ZIP32_MAX_ENTRY_SIZE,
} from "./zip.writer.helpers";

export type ZipEntry = {
  name: string;
  content: Uint8Array;
};

export type ZipStreamEntry = {
  name: string;
  content: Uint8Array | (() => Promise<Uint8Array>);
  expectedSize?: number | undefined;
};

export type CreateZipReadableStreamOptions = {
  archiveDate?: Date | undefined;
  logger?: Logger | undefined;
  requestId?: string | undefined;
};

/**
 * Computes exact total size of a ZIP archive in bytes upfront without reading file buffers into memory.
 */
export function calculateZipArchiveSize(
  entries: ReadonlyArray<{ name: string; size: number }>,
): number {
  const unique = deduplicateEntryNames(entries);
  const textEncoder = new TextEncoder();
  let total = 0;
  for (const entry of unique) {
    const nameLen = textEncoder.encode(entry.name).length;
    total += 30 + nameLen + entry.size + 46 + nameLen;
  }
  return total + 22; // + 22 bytes EOCD
}

function buildLocalHeaderPrefix(
  nameBytes: Uint8Array,
  checksum: number,
  size: number,
  dosTime: number,
  dosDate: number,
): Uint8Array {
  const prefix = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength);
  view.setUint32(0, 0x04034b50, true); // signature PK\x03\x04
  view.setUint16(4, 20, true); // version needed to extract (2.0)
  view.setUint16(6, 0x0800, true); // flags: UTF-8 filename (bit 11)
  view.setUint16(8, 0, true); // compression: 0 (Store)
  view.setUint16(10, dosTime, true);
  view.setUint16(12, dosDate, true);
  view.setUint32(14, checksum, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
  prefix.set(nameBytes, 30);
  return prefix;
}

type CentralRecord = {
  nameBytes: Uint8Array;
  checksum: number;
  size: number;
  offset: number;
};

function buildCentralDirectory(
  records: ReadonlyArray<CentralRecord>,
  dosTime: number,
  dosDate: number,
): Uint8Array {
  const totalSize = records.reduce((sum, r) => sum + 46 + r.nameBytes.length, 0);
  const cd = new Uint8Array(totalSize);
  const view = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  let pos = 0;
  for (const r of records) {
    view.setUint32(pos, 0x02014b50, true); // signature PK\x01\x02
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, 20, true);
    view.setUint16(pos + 8, 0x0800, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, dosTime, true);
    view.setUint16(pos + 14, dosDate, true);
    view.setUint32(pos + 16, r.checksum, true);
    view.setUint32(pos + 20, r.size, true);
    view.setUint32(pos + 24, r.size, true);
    view.setUint16(pos + 28, r.nameBytes.length, true);
    view.setUint16(pos + 30, 0, true);
    view.setUint16(pos + 32, 0, true);
    view.setUint16(pos + 34, 0, true);
    view.setUint16(pos + 36, 0, true);
    view.setUint32(pos + 38, 0, true);
    view.setUint32(pos + 42, r.offset, true);
    cd.set(r.nameBytes, pos + 46);
    pos += 46 + r.nameBytes.length;
  }
  return cd;
}

function buildEocd(
  recordCount: number,
  centralDirSize: number,
  centralDirOffset: number,
): Uint8Array {
  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer, eocd.byteOffset, eocd.byteLength);
  view.setUint32(0, 0x06054b50, true); // signature PK\x05\x06
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, recordCount, true);
  view.setUint16(10, recordCount, true);
  view.setUint32(12, centralDirSize, true);
  view.setUint32(16, centralDirOffset, true);
  view.setUint16(20, 0, true);
  return eocd;
}

/**
 * Streams a standard ZIP archive chunk by chunk using an AsyncGenerator.
 * Each entry is fetched on-demand and yielded immediately, avoiding multiple copies
 * of file payloads in memory.
 */
export async function* createZipStream(
  entries: ReadonlyArray<ZipStreamEntry>,
  archiveDate: Date = new Date(),
): AsyncGenerator<Uint8Array, void, unknown> {
  const uniqueEntries = deduplicateEntryNames(entries);
  if (uniqueEntries.length > ZIP32_MAX_ENTRY_COUNT) {
    throw new Error(`Jumlah entry ZIP (${uniqueEntries.length}) melebihi batas 16-bit (65.535)`);
  }

  const { time: dosTime, date: dosDate } = toDosDateTime(archiveDate);
  const textEncoder = new TextEncoder();
  const centralRecords: CentralRecord[] = [];
  let currentOffset = 0;

  for (const entry of uniqueEntries) {
    let content: Uint8Array | undefined =
      typeof entry.content === "function" ? await entry.content() : entry.content;

    if (entry.expectedSize !== undefined && content.byteLength !== entry.expectedSize) {
      throw new Error(
        `Ukuran berkas "${entry.name}" (${content.byteLength} byte) tidak sesuai dengan metadata (${entry.expectedSize} byte)`,
      );
    }

    if (content.byteLength > ZIP32_MAX_ENTRY_SIZE) {
      throw new Error(`Ukuran entry ZIP "${entry.name}" melebihi batas 32-bit (4 GiB)`);
    }

    const nameBytes = textEncoder.encode(entry.name);
    const checksum = crc32(content);
    const prefix = buildLocalHeaderPrefix(nameBytes, checksum, content.length, dosTime, dosDate);

    centralRecords.push({
      nameBytes,
      checksum,
      size: content.length,
      offset: currentOffset,
    });
    currentOffset += prefix.length + content.length;

    if (currentOffset > ZIP32_MAX_ARCHIVE_SIZE) {
      throw new Error("Ukuran total arsip ZIP melebihi batas 32-bit (4 GiB)");
    }

    yield prefix;
    yield content;
    // F7: Immediately dereference content to allow garbage collection before loading the next entry
    content = undefined;
  }

  const centralDir = buildCentralDirectory(centralRecords, dosTime, dosDate);
  if (currentOffset + centralDir.length + 22 > ZIP32_MAX_ARCHIVE_SIZE) {
    throw new Error("Ukuran total arsip ZIP melebihi batas 32-bit (4 GiB)");
  }

  const eocd = buildEocd(centralRecords.length, centralDir.length, currentOffset);

  yield centralDir;
  yield eocd;
}

/**
 * Creates a standard Web ReadableStream<Uint8Array> from a list of streaming ZIP entries.
 */
export function createZipReadableStream(
  entries: ReadonlyArray<ZipStreamEntry>,
  options?: CreateZipReadableStreamOptions | Date,
): ReadableStream<Uint8Array> {
  const archiveDate = options instanceof Date ? options : (options?.archiveDate ?? new Date());
  const logger = options && !(options instanceof Date) ? options.logger : undefined;
  const requestId = options && !(options instanceof Date) ? options.requestId : undefined;

  const iterator = createZipStream(entries, archiveDate);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        logger?.error(
          {
            requestId,
            error: summarizeError(error),
          },
          "Kegagalan saat streaming arsip ZIP",
        );
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return();
    },
  });
}
