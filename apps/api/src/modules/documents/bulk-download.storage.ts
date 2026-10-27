import type { StorageAdapter } from "@axentra/storage";

export const DEFAULT_STORAGE_RETRIEVAL_TIMEOUT_MS = 30_000; // 30s

/**
 * Retrieves a storage object with an explicit timeout (default 30 seconds)
 * to prevent deadlocks from hung network/storage requests.
 */
export async function getObjectWithTimeout(
  storage: StorageAdapter,
  key: string,
  timeoutMs = DEFAULT_STORAGE_RETRIEVAL_TIMEOUT_MS,
): Promise<Uint8Array> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // The object key is deliberately left out: this message can reach logs.
      reject(new Error(`Storage retrieval timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([storage.getObject(key), timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
