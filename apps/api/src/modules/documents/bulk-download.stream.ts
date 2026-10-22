import type { StorageAdapter } from "@axentra/storage";

export type MonitoredZipStreamOptions = {
  readonly chunkSize?: number | undefined;
  readonly transferTimeoutMs?: number | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly onRelease?: (() => void) | undefined;
};

/**
 * Creates a standard Web ReadableStream that streams pre-assembled ZIP bytes in chunks
 * while retaining the semaphore concurrency slot until the client finishes reading,
 * aborts, disconnects, or hits the transfer timeout (F24, F25).
 */
export function createMonitoredZipStream(
  bytes: Uint8Array,
  releaseSlot: () => void,
  options?: MonitoredZipStreamOptions,
): ReadableStream<Uint8Array> {
  const chunkSize = options?.chunkSize ?? 64 * 1024; // 64 KB chunks
  const totalSize = bytes.byteLength;
  const transferTimeoutMs = options?.transferTimeoutMs ?? 60_000;
  const signal = options?.signal;

  let offset = 0;
  let released = false;

  let timer: ReturnType<typeof setTimeout> | undefined;

  const safeRelease = (): void => {
    if (!released) {
      released = true;
      if (timer !== undefined) clearTimeout(timer);
      if (signal !== undefined) signal.removeEventListener("abort", abortHandler);
      releaseSlot();
      options?.onRelease?.();
    }
  };

  const abortHandler = (): void => {
    safeRelease();
  };

  if (signal !== undefined) {
    if (signal.aborted) {
      safeRelease();
    } else {
      signal.addEventListener("abort", abortHandler, { once: true });
    }
  }

  if (transferTimeoutMs > 0) {
    timer = setTimeout(() => {
      safeRelease();
    }, transferTimeoutMs);
  }

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset < totalSize) {
        const nextOffset = Math.min(offset + chunkSize, totalSize);
        controller.enqueue(bytes.subarray(offset, nextOffset));
        offset = nextOffset;
      } else {
        controller.close();
        safeRelease();
      }
    },
    cancel() {
      safeRelease();
    },
  });
}

/**
 * Retrieves a storage object with an explicit timeout (default 30 seconds)
 * to prevent deadlocks from hung network/storage requests (F25).
 */
export async function getObjectWithTimeout(
  storage: StorageAdapter,
  key: string,
  timeoutMs = 30_000,
): Promise<Uint8Array> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Storage retrieval timed out after ${timeoutMs}ms for key "${key}"`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([storage.getObject(key), timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
