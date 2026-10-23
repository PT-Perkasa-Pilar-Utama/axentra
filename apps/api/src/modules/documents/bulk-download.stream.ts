import type { StorageAdapter } from "@axentra/storage";

export const DEFAULT_STREAM_CHUNK_BYTES = 64 * 1024; // 64 KB
export const DEFAULT_STREAM_TRANSFER_TIMEOUT_MS = 60_000; // 60s
export const DEFAULT_STORAGE_RETRIEVAL_TIMEOUT_MS = 30_000; // 30s

export type MonitoredZipStreamOptions = {
  readonly chunkSize?: number | undefined;
  readonly transferTimeoutMs?: number | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly onRelease?: (() => void) | undefined;
};

/**
 * Creates a standard Web ReadableStream that streams pre-assembled ZIP bytes in chunks
 * while retaining the semaphore concurrency slot until the client finishes reading,
 * aborts, disconnects, or hits the transfer timeout.
 */
export function createMonitoredZipStream(
  bytes: Uint8Array,
  releaseSlot: () => void,
  options?: MonitoredZipStreamOptions,
): ReadableStream<Uint8Array> {
  const chunkSize = options?.chunkSize ?? DEFAULT_STREAM_CHUNK_BYTES;
  const totalSize = bytes.byteLength;
  const transferTimeoutMs = options?.transferTimeoutMs ?? DEFAULT_STREAM_TRANSFER_TIMEOUT_MS;
  const signal = options?.signal;

  let offset = 0;
  let released = false;
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;

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
      try {
        streamController?.error(new Error("Batas waktu transfer unduhan massal terlampaui"));
      } catch {
        // Stream may already be closed
      }
    }, transferTimeoutMs);
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
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
      reject(new Error(`Storage retrieval timed out after ${timeoutMs}ms for key "${key}"`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([storage.getObject(key), timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
