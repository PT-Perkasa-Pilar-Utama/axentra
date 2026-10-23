import { crc32 } from "node:zlib";
import { PayloadTooLargeError } from "../../http/errors";
import {
  deduplicateEntryNames,
  toDosDateTime,
  ZIP32_MAX_ENTRY_COUNT,
  ZIP32_MAX_ENTRY_SIZE,
} from "./zip.writer.helpers";

export {
  deduplicateEntryNames,
  sanitizeZipEntryName,
  toDosDateTime,
  ZIP32_MAX_ENTRY_COUNT,
  ZIP32_MAX_ENTRY_SIZE,
} from "./zip.writer.helpers";

export type ZipEntry = {
  name: string;
  content: Uint8Array;
};

type CentralRecord = {
  nameBytes: Uint8Array;
  checksum: number;
  size: number;
  offset: number;
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

/**
 * Creates a standard ZIP archive as a single contiguous Uint8Array in memory.
 * Allocates exactly the required buffer once, preventing 3x memory multiplication.
 */
export function createZipArchive(
  entries: ReadonlyArray<ZipEntry>,
  archiveDate: Date = new Date(),
): Uint8Array {
  const uniqueEntries = deduplicateEntryNames(entries);
  if (uniqueEntries.length > ZIP32_MAX_ENTRY_COUNT) {
    throw new PayloadTooLargeError(
      `Jumlah entry ZIP (${uniqueEntries.length}) melebihi batas 16-bit (65.535)`,
    );
  }

  for (const entry of uniqueEntries) {
    if (entry.content.byteLength > ZIP32_MAX_ENTRY_SIZE) {
      throw new PayloadTooLargeError(
        `Ukuran entry ZIP "${entry.name}" melebihi batas 32-bit (4 GiB)`,
      );
    }
  }

  const { time: dosTime, date: dosDate } = toDosDateTime(archiveDate);
  const textEncoder = new TextEncoder();

  const metaList = uniqueEntries.map((e) => ({
    name: e.name,
    size: e.content.byteLength,
  }));
  const totalArchiveSize = calculateZipArchiveSize(metaList);
  const archive = new Uint8Array(totalArchiveSize);
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);

  const centralRecords: CentralRecord[] = [];
  let currentOffset = 0;

  for (const entry of uniqueEntries) {
    const content = entry.content;
    const nameBytes = textEncoder.encode(entry.name);
    const checksum = crc32(content);
    const localHeaderOffset = currentOffset;

    view.setUint32(localHeaderOffset, 0x04034b50, true); // PK\x03\x04
    view.setUint16(localHeaderOffset + 4, 20, true);
    view.setUint16(localHeaderOffset + 6, 0x0800, true);
    view.setUint16(localHeaderOffset + 8, 0, true);
    view.setUint16(localHeaderOffset + 10, dosTime, true);
    view.setUint16(localHeaderOffset + 12, dosDate, true);
    view.setUint32(localHeaderOffset + 14, checksum, true);
    view.setUint32(localHeaderOffset + 18, content.length, true);
    view.setUint32(localHeaderOffset + 22, content.length, true);
    view.setUint16(localHeaderOffset + 26, nameBytes.length, true);
    view.setUint16(localHeaderOffset + 28, 0, true);

    archive.set(nameBytes, localHeaderOffset + 30);
    const contentOffset = localHeaderOffset + 30 + nameBytes.length;
    archive.set(content, contentOffset);

    centralRecords.push({
      nameBytes,
      checksum,
      size: content.length,
      offset: localHeaderOffset,
    });

    currentOffset = contentOffset + content.length;
  }

  const centralDirOffset = currentOffset;
  for (const r of centralRecords) {
    view.setUint32(currentOffset, 0x02014b50, true); // PK\x01\x02
    view.setUint16(currentOffset + 4, 20, true);
    view.setUint16(currentOffset + 6, 20, true);
    view.setUint16(currentOffset + 8, 0x0800, true);
    view.setUint16(currentOffset + 10, 0, true);
    view.setUint16(currentOffset + 12, dosTime, true);
    view.setUint16(currentOffset + 14, dosDate, true);
    view.setUint32(currentOffset + 16, r.checksum, true);
    view.setUint32(currentOffset + 20, r.size, true);
    view.setUint32(currentOffset + 24, r.size, true);
    view.setUint16(currentOffset + 28, r.nameBytes.length, true);
    view.setUint16(currentOffset + 30, 0, true);
    view.setUint16(currentOffset + 32, 0, true);
    view.setUint16(currentOffset + 34, 0, true);
    view.setUint16(currentOffset + 36, 0, true);
    view.setUint32(currentOffset + 38, 0, true);
    view.setUint32(currentOffset + 42, r.offset, true);
    archive.set(r.nameBytes, currentOffset + 46);
    currentOffset += 46 + r.nameBytes.length;
  }
  const centralDirSize = currentOffset - centralDirOffset;

  view.setUint32(currentOffset, 0x06054b50, true); // PK\x05\x06
  view.setUint16(currentOffset + 4, 0, true);
  view.setUint16(currentOffset + 6, 0, true);
  view.setUint16(currentOffset + 8, centralRecords.length, true);
  view.setUint16(currentOffset + 10, centralRecords.length, true);
  view.setUint32(currentOffset + 12, centralDirSize, true);
  view.setUint32(currentOffset + 16, centralDirOffset, true);
  view.setUint16(currentOffset + 20, 0, true);

  return archive;
}
