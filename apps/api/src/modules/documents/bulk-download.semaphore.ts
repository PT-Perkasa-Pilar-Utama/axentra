import { TooManyRequestsError } from "../../http/errors";

export type BulkDownloadSemaphoreOptions = {
  readonly maxConcurrency?: number;
  readonly maxQueueLength?: number;
};

/**
 * In-process async semaphore to bound peak RSS for bulk ZIP downloads (F7, F10).
 * Restricts active memory-intensive prefetch and archive assembly to `maxConcurrency`
 * (default 2), capping peak RSS to ~1 GB under concurrent loads.
 */
export class BulkDownloadSemaphore {
  public readonly maxConcurrency: number;
  public readonly maxQueueLength: number;

  private active = 0;
  private readonly queue: Array<() => void> = [];

  public constructor(options?: BulkDownloadSemaphoreOptions) {
    this.maxConcurrency = options?.maxConcurrency ?? 2;
    this.maxQueueLength = options?.maxQueueLength ?? 10;
  }

  /**
   * Acquires a concurrency slot. Returns an idempotent release function.
   * If concurrency is saturated, waits in queue until a slot frees up.
   * If queue capacity is exceeded, throws TooManyRequestsError (429).
   */
  public async acquire(): Promise<() => void> {
    if (this.active < this.maxConcurrency) {
      this.active++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          this.release();
        }
      };
    }

    if (this.queue.length >= this.maxQueueLength) {
      throw new TooManyRequestsError(
        "Terlalu banyak permintaan unduhan massal secara bersamaan, antrean penuh",
      );
    }

    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        let released = false;
        resolve(() => {
          if (!released) {
            released = true;
            this.release();
          }
        });
      });
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.active = Math.max(0, this.active - 1);
    }
  }

  public get activeCount(): number {
    return this.active;
  }

  public get queueLength(): number {
    return this.queue.length;
  }

  public reset(): void {
    this.active = 0;
    this.queue.length = 0;
  }
}

/**
 * Default process-wide singleton semaphore for bulk download operations.
 */
export const globalBulkDownloadSemaphore = new BulkDownloadSemaphore({
  maxConcurrency: 2,
  maxQueueLength: 10,
});
