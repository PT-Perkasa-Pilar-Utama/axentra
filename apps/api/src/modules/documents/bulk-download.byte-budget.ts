import { BULK_DOWNLOAD_INFLIGHT_BYTES_LIMIT } from "./bulk-download.semaphore";
import { calculateZipArchiveSize } from "./zip.writer";

/**
 * Per-process budget for the bytes that bulk downloads hold in memory. A reservation is taken after the
 * concurrency slot and before the first storage read, so a request that does not fit is refused without
 * reading storage. It is released when the request aborts, when prefetch, assembly, or the audit fails,
 * when the consumer cancels the response body, or when the transfer window ends. Reservations are never
 * queued: a request that would exceed the limit is refused.
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
 * Upper bound of the bytes one bulk download holds. The prefetched entry buffers and the archive that
 * copies them are both alive while the archive is assembled, so the bound is the stored file sizes plus
 * the exact archive size computed from metadata (file sizes, local and central headers, entry names, and
 * the end record).
 */
export function calculateBulkDownloadReservationBytes(
  entries: ReadonlyArray<{ name: string; size: number }>,
): number {
  const entryBytes = entries.reduce((total, entry) => total + entry.size, 0);
  return entryBytes + calculateZipArchiveSize(entries);
}

/**
 * Default process-wide byte budget for bulk download responses, applied per API instance.
 */
export const globalBulkDownloadByteBudget = new BulkDownloadByteBudget();
