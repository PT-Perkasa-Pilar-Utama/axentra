export const BULK_DOWNLOAD_TRANSFER_TIMEOUT_MS = 60_000;
const BULK_DOWNLOAD_CHUNK_BYTES = 64 * 1024;

export type BulkDownloadBodyOptions = {
  // Releases the concurrency slot and the byte reservation. Invoked at most once per body.
  readonly release: () => void;
  readonly signal?: AbortSignal | undefined;
  readonly transferTimeoutMs?: number | undefined;
  readonly chunkBytes?: number | undefined;
};

/**
 * Streams an assembled archive as a response body. `release` runs exactly once, when the body is
 * fully read, cancelled, aborted through the request signal, or when the transfer timer fires. The
 * archive reference is dropped at that point so its memory can be reclaimed.
 *
 * The body is chunked: no Content-Length is set, because Bun drops an explicit Content-Length on
 * streamed bodies. Bun also reads a stream to its end almost at once, so `release` can run before the
 * client has received the bytes. The byte budget bounds streaming overlap, not socket-level buffering.
 */
export function createBulkDownloadBody(
  archive: Uint8Array,
  options: BulkDownloadBodyOptions,
): ReadableStream<Uint8Array> {
  const transferTimeoutMs = options.transferTimeoutMs ?? BULK_DOWNLOAD_TRANSFER_TIMEOUT_MS;
  const chunkBytes = Math.max(1, options.chunkBytes ?? BULK_DOWNLOAD_CHUNK_BYTES);
  let pending: Uint8Array | null = archive;
  let offset = 0;
  let finished = false;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onAbort = (): void => {
    finish(new Error("Transfer unduhan massal dibatalkan oleh klien"));
  };

  function finish(error?: Error): void {
    if (finished) return;
    finished = true;
    pending = null;
    if (timer !== undefined) clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
    options.release();
    if (error !== undefined) controller?.error(error);
  }

  return new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
      timer = setTimeout(() => {
        finish(new Error("Batas waktu transfer unduhan massal terlampaui"));
      }, transferTimeoutMs);
      if (options.signal?.aborted === true) {
        onAbort();
        return;
      }
      options.signal?.addEventListener("abort", onAbort, { once: true });
    },
    pull(streamController) {
      if (finished || pending === null) return;
      const end = Math.min(offset + chunkBytes, pending.byteLength);
      streamController.enqueue(pending.subarray(offset, end));
      offset = end;
      if (offset >= pending.byteLength) {
        streamController.close();
        finish();
      }
    },
    cancel() {
      finish();
    },
  });
}
