import { BULK_DOWNLOAD_INFLIGHT_BYTES_LIMIT } from "./bulk-download.semaphore";

/**
 * Per-process budget for archive bytes held by bulk download responses that are still streaming.
 * A reservation is taken once the ZIP is assembled and before the audit is written. It is released
 * when the response body finishes, is cancelled, or is aborted, or when the body's transfer timer
 * fires. Reservations are never queued: a request that would exceed the limit is refused.
 */
export class BulkDownloadByteBudget {
  public readonly limitBytes: number;

  private reserved = 0;

  public constructor(limitBytes: number = BULK_DOWNLOAD_INFLIGHT_BYTES_LIMIT) {
    this.limitBytes = limitBytes;
  }

  /**
   * Reserves `bytes` and returns an idempotent release function. Returns null when the reservation
   * would exceed the limit, in which case nothing is reserved.
   */
  public tryReserve(bytes: number): (() => void) | null {
    if (this.reserved + bytes > this.limitBytes) return null;
    this.reserved += bytes;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.reserved = Math.max(0, this.reserved - bytes);
    };
  }

  public get reservedBytes(): number {
    return this.reserved;
  }
}

/**
 * Default process-wide byte budget for bulk download responses, applied per API instance.
 */
export const globalBulkDownloadByteBudget = new BulkDownloadByteBudget();
