// How long the concurrency slot and the byte reservation stay held after the response starts.
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
 * Streams an assembled archive as a response body and owns the release of the slot and the byte
 * reservation after hand-off. `release` runs exactly once: when the request signal aborts, when the
 * consumer cancels the body, or when the transfer window (`transferTimeoutMs`) ends. If the body is
 * still being read at that point, it is failed.
 *
 * Draining the stream releases nothing. On Bun 1.3.12, Bun.serve pulls the whole body into its own
 * buffer within milliseconds, then writes it at the client's pace, and it reports neither the end of
 * that write nor a later disconnect to the handler. The archive reference is dropped once drained, but
 * Bun's copy stays in memory until the socket finishes; a client slower than the window keeps it after
 * the release.
 *
 * The body is chunked: no Content-Length is set. On Bun 1.3.12, Bun drops an explicit Content-Length
 * on streamed bodies; Bun 1.4.3 keeps it (probe), so this choice depends on D30.
 */
export function createBulkDownloadBody(
  archive: Uint8Array,
  options: BulkDownloadBodyOptions,
): ReadableStream<Uint8Array> {
  const transferTimeoutMs = options.transferTimeoutMs ?? BULK_DOWNLOAD_TRANSFER_TIMEOUT_MS;
  const chunkBytes = Math.max(1, options.chunkBytes ?? BULK_DOWNLOAD_CHUNK_BYTES);
  let pending: Uint8Array | null = archive;
  let offset = 0;
  let released = false;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onAbort = (): void => {
    finish(new Error("Transfer unduhan massal dibatalkan oleh klien"));
  };

  function finish(error?: Error): void {
    if (released) return;
    released = true;
    if (timer !== undefined) clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
    options.release();
    // Only a body that has not been fully enqueued can still be failed.
    if (error !== undefined && pending !== null) controller?.error(error);
    pending = null;
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
      if (pending === null) return;
      const end = Math.min(offset + chunkBytes, pending.byteLength);
      streamController.enqueue(pending.subarray(offset, end));
      offset = end;
      if (offset >= pending.byteLength) {
        streamController.close();
        // Enqueued is not delivered: the slot and reservation stay held until abort, cancel, or the
        // end of the transfer window. Only this reference to the archive is dropped.
        pending = null;
      }
    },
    cancel() {
      finish();
    },
  });
}
