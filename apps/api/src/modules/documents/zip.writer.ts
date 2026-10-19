import { crc32 } from "node:zlib";

export type ZipEntry = {
  name: string;
  content: Uint8Array;
};

export const ZIP32_MAX_ENTRY_SIZE = 0xffffffff; // 4 GiB
export const ZIP32_MAX_ARCHIVE_SIZE = 0xffffffff; // 4 GiB

/**
 * Sanitizes ZIP entry names to prevent path traversal attacks.
 * Strips Windows/POSIX drive letters, directories, ../, ..\, and leading/trailing separators.
 * If the resulting name is empty or invalid, falls back to a safe identifier.
 */
export function sanitizeZipEntryName(rawName: string): string {
  // Normalize Windows separators to POSIX
  let cleaned = rawName.replace(/\\/g, "/");

  // Remove Windows drive letters (e.g. C:/)
  cleaned = cleaned.replace(/^[a-zA-Z]:[/]*/, "");

  // Remove leading slashes
  cleaned = cleaned.replace(/^[/]+/, "");

  // Take only the basename after the last slash
  const lastSlash = cleaned.lastIndexOf("/");
  if (lastSlash >= 0) {
    cleaned = cleaned.slice(lastSlash + 1);
  }

  // Remove any remaining path traversal tokens (.. or .)
  cleaned = cleaned
    .replace(/\.\.+[/]*/g, "")
    .replace(/[/]/g, "")
    .trim();

  // If empty or purely dots, fallback
  if (!cleaned || cleaned === "." || cleaned === "..") {
    return "document";
  }

  return cleaned;
}

/**
 * Converts a JS Date into MS-DOS packed time and date (2 bytes each).
 */
export function toDosDateTime(date: Date = new Date()): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;

  return { time: dosTime, date: dosDate };
}

/**
 * Disambiguates duplicate filenames by appending an incrementing index
 * before the file extension (e.g. "laporan.pdf" -> "laporan (1).pdf").
 * Also sanitizes entry names against path traversal.
 */
export function deduplicateEntryNames(entries: ReadonlyArray<ZipEntry>): Array<ZipEntry> {
  const seenCount = new Map<string, number>();
  const result: Array<ZipEntry> = [];

  for (const entry of entries) {
    const rawName = sanitizeZipEntryName(entry.name);
    const count = seenCount.get(rawName) ?? 0;
    seenCount.set(rawName, count + 1);

    if (count === 0) {
      result.push({ name: rawName, content: entry.content });
      continue;
    }

    const dotIndex = rawName.lastIndexOf(".");
    const hasExtension = dotIndex > 0;
    const base = hasExtension ? rawName.slice(0, dotIndex) : rawName;
    const ext = hasExtension ? rawName.slice(dotIndex) : "";

    let candidate = `${base} (${count})${ext}`;
    let collisionIndex = count;
    while (seenCount.has(candidate)) {
      collisionIndex++;
      candidate = `${base} (${collisionIndex})${ext}`;
    }
    seenCount.set(candidate, 1);
    result.push({ name: candidate, content: entry.content });
  }

  return result;
}

/**
 * Builds a standard ZIP archive (PKZIP 2.0 Store mode, uncompressed) from an array of entries.
 * Computes standard IEEE 802.3 CRC32 for each entry and writes proper Local File Headers,
 * Central Directory File Headers, and the End of Central Directory record.
 */
export function createZipArchive(
  entries: ReadonlyArray<ZipEntry>,
  archiveDate: Date = new Date(),
): Uint8Array {
  const uniqueEntries = deduplicateEntryNames(entries);
  const { time: dosTime, date: dosDate } = toDosDateTime(archiveDate);

  const localHeaders: Array<Uint8Array> = [];
  const centralHeaders: Array<Uint8Array> = [];
  let currentOffset = 0;

  for (const entry of uniqueEntries) {
    if (entry.content.byteLength > ZIP32_MAX_ENTRY_SIZE) {
      throw new Error(`Ukuran entry ZIP "${entry.name}" melebihi batas 32-bit (4 GiB)`);
    }

    const nameBytes = new TextEncoder().encode(entry.name);
    const content = entry.content;
    const checksum = crc32(content);

    // 1. Local file header (30 bytes + nameBytes.length + content.length)
    const localHeader = new Uint8Array(30 + nameBytes.length + content.length);
    const lhView = new DataView(localHeader.buffer, localHeader.byteOffset, localHeader.byteLength);

    lhView.setUint32(0, 0x04034b50, true); // signature PK\x03\x04
    lhView.setUint16(4, 20, true); // version needed to extract (2.0)
    lhView.setUint16(6, 0x0800, true); // flags: UTF-8 filename (bit 11)
    lhView.setUint16(8, 0, true); // compression method: 0 (Store)
    lhView.setUint16(10, dosTime, true);
    lhView.setUint16(12, dosDate, true);
    lhView.setUint32(14, checksum, true);
    lhView.setUint32(18, content.length, true); // compressed size
    lhView.setUint32(22, content.length, true); // uncompressed size
    lhView.setUint16(26, nameBytes.length, true);
    lhView.setUint16(28, 0, true); // extra field length
    localHeader.set(nameBytes, 30);
    localHeader.set(content, 30 + nameBytes.length);
    localHeaders.push(localHeader);

    // 2. Central directory file header (46 bytes + nameBytes.length)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const chView = new DataView(
      centralHeader.buffer,
      centralHeader.byteOffset,
      centralHeader.byteLength,
    );

    chView.setUint32(0, 0x02014b50, true); // signature PK\x01\x02
    chView.setUint16(4, 20, true); // version made by
    chView.setUint16(6, 20, true); // version needed to extract
    chView.setUint16(8, 0x0800, true); // flags: UTF-8 filename (bit 11)
    chView.setUint16(10, 0, true); // compression method: 0 (Store)
    chView.setUint16(12, dosTime, true);
    chView.setUint16(14, dosDate, true);
    chView.setUint32(16, checksum, true);
    chView.setUint32(20, content.length, true); // compressed size
    chView.setUint32(24, content.length, true); // uncompressed size
    chView.setUint16(28, nameBytes.length, true);
    chView.setUint16(30, 0, true); // extra field length
    chView.setUint16(32, 0, true); // comment length
    chView.setUint16(34, 0, true); // disk number start
    chView.setUint16(36, 0, true); // internal attributes
    chView.setUint32(38, 0, true); // external attributes
    chView.setUint32(42, currentOffset, true); // relative offset of local header
    centralHeader.set(nameBytes, 46);
    centralHeaders.push(centralHeader);

    currentOffset += localHeader.length;
  }

  const centralDirOffset = currentOffset;
  const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);

  // 3. End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer, eocd.byteOffset, eocd.byteLength);
  eocdView.setUint32(0, 0x06054b50, true); // signature PK\x05\x06
  eocdView.setUint16(4, 0, true); // disk number
  eocdView.setUint16(6, 0, true); // disk start
  eocdView.setUint16(8, uniqueEntries.length, true); // records on this disk
  eocdView.setUint16(10, uniqueEntries.length, true); // total records
  eocdView.setUint32(12, centralDirSize, true);
  eocdView.setUint32(16, centralDirOffset, true);
  eocdView.setUint16(20, 0, true); // comment length

  // 4. Assemble final archive
  const totalLength = currentOffset + centralDirSize + eocd.length;
  if (totalLength > ZIP32_MAX_ARCHIVE_SIZE) {
    throw new Error("Ukuran total arsip ZIP melebihi batas 32-bit (4 GiB)");
  }

  const result = new Uint8Array(totalLength);
  let pos = 0;

  for (const lh of localHeaders) {
    result.set(lh, pos);
    pos += lh.length;
  }
  for (const ch of centralHeaders) {
    result.set(ch, pos);
    pos += ch.length;
  }
  result.set(eocd, pos);

  return result;
}
