import { RequestSemaphore } from "../../http/request-semaphore";

export const DEFAULT_BULK_DOWNLOAD_MAX_CONCURRENCY = 2;
export const DEFAULT_BULK_DOWNLOAD_MAX_QUEUE_LENGTH = 10;
export const DEFAULT_BULK_DOWNLOAD_QUEUE_TIMEOUT_MS = 30_000;
// Per-process cap on the bytes reserved by bulk downloads (see BulkDownloadByteBudget). A reservation
// covers the prefetched entries plus the archive, so one maximum-size request (2 x 250 MB plus ZIP
// overhead) fits and a second concurrent one does not.
export const BULK_DOWNLOAD_INFLIGHT_BYTES_LIMIT = 512 * 1024 * 1024;
export const BULK_DOWNLOAD_BUSY_MESSAGE =
  "Terlalu banyak permintaan unduhan massal secara bersamaan, antrean penuh";
export const BULK_DOWNLOAD_ABORTED_MESSAGE = "Permintaan unduhan massal dibatalkan oleh klien";
const BULK_DOWNLOAD_QUEUE_TIMEOUT_MESSAGE =
  "Batas waktu tunggu antrean unduhan massal terlampaui, silakan coba beberapa saat lagi";

export type BulkDownloadSemaphoreOptions = {
  readonly maxConcurrency?: number;
  readonly maxQueueLength?: number;
  readonly queueTimeoutMs?: number;
};

/**
 * In-process semaphore that bounds concurrent bulk downloads (default 2 per process instance, queue
 * capacity 10). A slot is taken before the storage prefetch and is held for the same lifetime as the
 * byte reservation: until the request aborts, the request fails, the consumer cancels the body, or the
 * transfer window ends (see createBulkDownloadBody).
 */
export class BulkDownloadSemaphore extends RequestSemaphore {
  public constructor(options?: BulkDownloadSemaphoreOptions) {
    super({
      maxConcurrency: options?.maxConcurrency ?? DEFAULT_BULK_DOWNLOAD_MAX_CONCURRENCY,
      maxQueueLength: options?.maxQueueLength ?? DEFAULT_BULK_DOWNLOAD_MAX_QUEUE_LENGTH,
      queueTimeoutMs: options?.queueTimeoutMs ?? DEFAULT_BULK_DOWNLOAD_QUEUE_TIMEOUT_MS,
      messages: {
        queueFull: BULK_DOWNLOAD_BUSY_MESSAGE,
        queueTimeout: BULK_DOWNLOAD_QUEUE_TIMEOUT_MESSAGE,
        aborted: BULK_DOWNLOAD_ABORTED_MESSAGE,
      },
    });
  }
}

/**
 * Default process-wide singleton semaphore for bulk download operations.
 * Applied per API instance.
 */
export const globalBulkDownloadSemaphore = new BulkDownloadSemaphore();
