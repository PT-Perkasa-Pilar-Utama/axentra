import type { StorageAdapter } from "@axentra/storage";
import { BULK_DOWNLOAD_ABORTED_MESSAGE } from "./bulk-download.semaphore";
import type { BulkDownloadItem } from "./bulk-download.targets";
import type { ZipEntry } from "./zip.writer";

export const DEFAULT_STORAGE_RETRIEVAL_TIMEOUT_MS = 30_000; // 30s

export type PrefetchBulkDownloadOptions = {
  readonly signal?: AbortSignal | undefined;
  readonly timeoutMs?: number | undefined;
};

/**
 * Retrieves a storage object with an explicit timeout (default 30 seconds) to prevent deadlocks from hung
 * network or storage requests. The wait also ends as soon as the request signal aborts: StorageAdapter reads
 * take no signal, so the caller stops waiting here and the read result is discarded.
 */
export async function getObjectWithTimeout(
  storage: StorageAdapter,
  key: string,
  timeoutMs = DEFAULT_STORAGE_RETRIEVAL_TIMEOUT_MS,
  signal?: AbortSignal | undefined,
): Promise<Uint8Array> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // The object key is deliberately left out: this message can reach logs.
      reject(new Error(`Storage retrieval timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    onAbort = () => reject(new Error(BULK_DOWNLOAD_ABORTED_MESSAGE));
    if (signal?.aborted === true) {
      onAbort();
    } else {
      signal?.addEventListener("abort", onAbort, { once: true });
    }
  });

  try {
    return await Promise.race([storage.getObject(key), guard]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort !== undefined) signal?.removeEventListener("abort", onAbort);
  }
}

// Fails a request whose client has gone, so no further storage read and no audit write happen for it.
export function throwIfBulkDownloadAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new Error(BULK_DOWNLOAD_ABORTED_MESSAGE);
  }
}

/**
 * Reads every selected object in order and verifies its size against the metadata. StorageAdapter reads
 * take no AbortSignal, so an aborted request stops between object reads.
 */
export async function prefetchBulkDownloadEntries(
  storage: StorageAdapter,
  items: ReadonlyArray<BulkDownloadItem>,
  options: PrefetchBulkDownloadOptions,
): Promise<Array<ZipEntry>> {
  const entries: Array<ZipEntry> = [];
  for (const item of items) {
    throwIfBulkDownloadAborted(options.signal);
    const content = await getObjectWithTimeout(
      storage,
      item.file.storageKey,
      options.timeoutMs,
      options.signal,
    );
    if (content.byteLength !== item.file.fileSize) {
      throw new Error(
        `Ukuran berkas "${item.file.originalName}" (${content.byteLength} byte) tidak sesuai dengan metadata (${item.file.fileSize} byte)`,
      );
    }
    entries.push({ name: item.file.originalName, content });
  }
  return entries;
}
