export const ZIP32_MAX_ENTRY_SIZE = 0xffffffff; // 4 GiB
export const ZIP32_MAX_ENTRY_COUNT = 0xffff; // 65,535 entries
// The ZIP name-length field is 16-bit (65,535 bytes). Names are capped far below it, at the 255-byte
// limit of common file systems, so every extracted name stays usable.
export const ZIP_ENTRY_NAME_MAX_BYTES = 255;
// A suffix after the last dot counts as the extension, and survives truncation, only up to this size.
const ZIP_ENTRY_EXTENSION_MAX_BYTES = 32;
// C0 control characters (U+0000 to U+001F) and DEL (U+007F) are dropped from entry names.
const LAST_C0_CONTROL_CODE_POINT = 0x1f;
const DELETE_CODE_POINT = 0x7f;

const utf8Encoder = new TextEncoder();

function utf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).byteLength;
}

function stripControlCharacters(value: string): string {
  let result = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? DELETE_CODE_POINT;
    if (codePoint > LAST_C0_CONTROL_CODE_POINT && codePoint !== DELETE_CODE_POINT) {
      result += character;
    }
  }
  return result;
}

// Cuts on code-point boundaries, so a multi-byte character is never split.
function truncateUtf8(value: string, maxBytes: number): string {
  let result = "";
  let used = 0;
  for (const character of value) {
    const size = utf8ByteLength(character);
    if (used + size > maxBytes) break;
    result += character;
    used += size;
  }
  return result;
}

function splitExtension(name: string): { base: string; extension: string } {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0) return { base: name, extension: "" };
  const extension = name.slice(dotIndex);
  if (utf8ByteLength(extension) > ZIP_ENTRY_EXTENSION_MAX_BYTES) {
    return { base: name, extension: "" };
  }
  return { base: name.slice(0, dotIndex), extension };
}

// Joins the parts and shortens only the base, so the UTF-8 name fits ZIP_ENTRY_NAME_MAX_BYTES.
function composeEntryName(base: string, marker: string, extension: string): string {
  const room = ZIP_ENTRY_NAME_MAX_BYTES - utf8ByteLength(marker) - utf8ByteLength(extension);
  return `${truncateUtf8(base, room)}${marker}${extension}`;
}

/**
 * Sanitizes ZIP entry names to prevent path traversal attacks.
 * Removes control characters, strips Windows/POSIX drive letters, directories, ../, ..\, and
 * leading/trailing separators, then caps the UTF-8 length at ZIP_ENTRY_NAME_MAX_BYTES.
 * If the resulting name is empty or invalid, falls back to a safe identifier.
 */
export function sanitizeZipEntryName(rawName: string): string {
  let cleaned = stripControlCharacters(rawName).replace(/\\/g, "/");
  cleaned = cleaned.replace(/^[a-zA-Z]:[/]*/, "");
  cleaned = cleaned.replace(/^[/]+/, "");

  const lastSlash = cleaned.lastIndexOf("/");
  if (lastSlash >= 0) {
    cleaned = cleaned.slice(lastSlash + 1);
  }

  cleaned = cleaned
    .replace(/\.\.+[/]*/g, "")
    .replace(/[/]/g, "")
    .trim();

  if (!cleaned || cleaned === "." || cleaned === "..") {
    return "document";
  }

  const { base, extension } = splitExtension(cleaned);
  return composeEntryName(base, "", extension);
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
 * Also sanitizes entry names against path traversal. A suffixed name still fits the byte cap.
 */
export function deduplicateEntryNames<T extends { name: string }>(
  entries: ReadonlyArray<T>,
): Array<T> {
  const seenCount = new Map<string, number>();
  const result: Array<T> = [];

  for (const entry of entries) {
    const rawName = sanitizeZipEntryName(entry.name);
    const count = seenCount.get(rawName) ?? 0;
    seenCount.set(rawName, count + 1);

    if (count === 0) {
      result.push({ ...entry, name: rawName });
      continue;
    }

    const { base, extension } = splitExtension(rawName);
    let collisionIndex = count;
    let candidate = composeEntryName(base, ` (${collisionIndex})`, extension);
    while (seenCount.has(candidate)) {
      collisionIndex++;
      candidate = composeEntryName(base, ` (${collisionIndex})`, extension);
    }
    seenCount.set(candidate, 1);
    result.push({ ...entry, name: candidate });
  }

  return result;
}
