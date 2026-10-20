export const ZIP32_MAX_ENTRY_SIZE = 0xffffffff; // 4 GiB
export const ZIP32_MAX_ARCHIVE_SIZE = 0xffffffff; // 4 GiB

/**
 * Sanitizes ZIP entry names to prevent path traversal attacks.
 * Strips Windows/POSIX drive letters, directories, ../, ..\, and leading/trailing separators.
 * If the resulting name is empty or invalid, falls back to a safe identifier.
 */
export function sanitizeZipEntryName(rawName: string): string {
  let cleaned = rawName.replace(/\\/g, "/");
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
    result.push({ ...entry, name: candidate });
  }

  return result;
}
