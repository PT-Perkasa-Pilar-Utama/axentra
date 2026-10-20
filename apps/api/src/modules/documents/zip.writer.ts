import { crc32 } from "node:zlib";
import {
  deduplicateEntryNames,
  toDosDateTime,
  ZIP32_MAX_ARCHIVE_SIZE,
  ZIP32_MAX_ENTRY_SIZE,
} from "./zip.writer.helpers";

export {
  deduplicateEntryNames,
  sanitizeZipEntryName,
  toDosDateTime,
  ZIP32_MAX_ARCHIVE_SIZE,
  ZIP32_MAX_ENTRY_SIZE,
} from "./zip.writer.helpers";

export type ZipEntry = {
  name: string;
  content: Uint8Array;
};

export type ZipStreamEntry = {
  name: string;
  content: Uint8Array | (() => Promise<Uint8Array>);
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
  const { time: dosTime, date: dosDate } = toDosDateTime(archiveDate);
  const textEncoder = new TextEncoder();
  const centralRecords: CentralRecord[] = [];
  let currentOffset = 0;

  for (const entry of uniqueEntries) {
    const content = typeof entry.content === "function" ? await entry.content() : entry.content;
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

    yield prefix;
    yield content;
  }

  const centralDir = buildCentralDirectory(centralRecords, dosTime, dosDate);
  const eocd = buildEocd(centralRecords.length, centralDir.length, currentOffset);

  yield centralDir;
  yield eocd;
}

/**
 * Creates a standard Web ReadableStream<Uint8Array> from a list of streaming ZIP entries.
 */
export function createZipReadableStream(
  entries: ReadonlyArray<ZipStreamEntry>,
  archiveDate: Date = new Date(),
): ReadableStream<Uint8Array> {
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
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return();
    },
  });
}

/**
 * Builds a standard ZIP archive into a single Uint8Array without allocating
 * intermediate local header buffers or tripling memory.
 */
export function createZipArchive(
  entries: ReadonlyArray<ZipEntry>,
  archiveDate: Date = new Date(),
): Uint8Array {
  const uniqueEntries = deduplicateEntryNames(entries);
  const { time: dosTime, date: dosDate } = toDosDateTime(archiveDate);
  const textEncoder = new TextEncoder();

  type PreparedEntry = {
    nameBytes: Uint8Array;
    content: Uint8Array;
    checksum: number;
    size: number;
    offset: number;
  };

  const prepared: PreparedEntry[] = [];
  let currentOffset = 0;

  for (const entry of uniqueEntries) {
    if (entry.content.byteLength > ZIP32_MAX_ENTRY_SIZE) {
      throw new Error(`Ukuran entry ZIP "${entry.name}" melebihi batas 32-bit (4 GiB)`);
    }
    const nameBytes = textEncoder.encode(entry.name);
    const checksum = crc32(entry.content);
    prepared.push({
      nameBytes,
      content: entry.content,
      checksum,
      size: entry.content.length,
      offset: currentOffset,
    });
    currentOffset += 30 + nameBytes.length + entry.content.length;
  }

  const centralDir = buildCentralDirectory(prepared, dosTime, dosDate);
  const eocd = buildEocd(prepared.length, centralDir.length, currentOffset);
  const totalLength = currentOffset + centralDir.length + eocd.length;

  if (totalLength > ZIP32_MAX_ARCHIVE_SIZE) {
    throw new Error("Ukuran total arsip ZIP melebihi batas 32-bit (4 GiB)");
  }

  const result = new Uint8Array(totalLength);
  let pos = 0;

  for (const p of prepared) {
    const prefix = buildLocalHeaderPrefix(
      p.nameBytes,
      p.checksum,
      p.content.length,
      dosTime,
      dosDate,
    );
    result.set(prefix, pos);
    pos += prefix.length;
    result.set(p.content, pos);
    pos += p.content.length;
  }

  result.set(centralDir, pos);
  pos += centralDir.length;
  result.set(eocd, pos);

  return result;
}
