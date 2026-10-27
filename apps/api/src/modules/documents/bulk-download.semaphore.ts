import { TooManyRequestsError } from "../../http/errors";

export const DEFAULT_BULK_DOWNLOAD_MAX_CONCURRENCY = 2;
export const DEFAULT_BULK_DOWNLOAD_MAX_QUEUE_LENGTH = 10;
export const DEFAULT_BULK_DOWNLOAD_QUEUE_TIMEOUT_MS = 30_000;
// Per-process cap on archive bytes reserved by responses that are still streaming (see
// BulkDownloadByteBudget). Two maximum-size archives (2 x 250 MB) fit within it.
export const BULK_DOWNLOAD_INFLIGHT_BYTES_LIMIT = 512 * 1024 * 1024;
export const BULK_DOWNLOAD_BUSY_MESSAGE =
  "Terlalu banyak permintaan unduhan massal secara bersamaan, antrean penuh";

export type BulkDownloadSemaphoreOptions = {
  readonly maxConcurrency?: number;
  readonly maxQueueLength?: number;
  readonly queueTimeoutMs?: number;
};

export type SemaphoreAcquireOptions = {
  readonly signal?: AbortSignal | undefined;
  readonly timeoutMs?: number | undefined;
};

type QueueWaiter = {
  readonly resolve: (release: () => void) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
  cleanup: () => void;
};

/**
 * In-process async semaphore to bound concurrency and active memory for bulk ZIP downloads.
 * Restricts active memory-intensive prefetch, archive assembly, and streaming transmission
 * to `maxConcurrency` (default 2 per process instance, queue capacity 10).
 * Retains slot throughout the response stream until fully read or aborted, preventing unbounded accumulation.
 */
export class BulkDownloadSemaphore {
  public readonly maxConcurrency: number;
  public readonly maxQueueLength: number;
  public readonly queueTimeoutMs: number;

  private active = 0;
  private readonly queue: Array<QueueWaiter> = [];

  public constructor(options?: BulkDownloadSemaphoreOptions) {
    this.maxConcurrency = options?.maxConcurrency ?? DEFAULT_BULK_DOWNLOAD_MAX_CONCURRENCY;
    this.maxQueueLength = options?.maxQueueLength ?? DEFAULT_BULK_DOWNLOAD_MAX_QUEUE_LENGTH;
    this.queueTimeoutMs = options?.queueTimeoutMs ?? DEFAULT_BULK_DOWNLOAD_QUEUE_TIMEOUT_MS;
  }

  /**
   * Acquires a concurrency slot. Returns an idempotent release function.
   * If concurrency is saturated, waits in queue until a slot frees up.
   * If queue capacity is exceeded, throws TooManyRequestsError (429).
   * If waiting in queue exceeds timeout, throws TooManyRequestsError (429).
   * If signal aborts while in queue, cancels the waiter immediately.
   */
  public async acquire(options?: SemaphoreAcquireOptions): Promise<() => void> {
    if (options?.signal?.aborted) {
      throw new Error("Permintaan unduhan massal dibatalkan oleh klien");
    }

    if (this.active < this.maxConcurrency) {
      this.active++;
      return this.createReleaseFn();
    }

    if (this.queue.length >= this.maxQueueLength) {
      throw new TooManyRequestsError(BULK_DOWNLOAD_BUSY_MESSAGE);
    }

    const timeoutDuration = options?.timeoutMs ?? this.queueTimeoutMs;
    const signal = options?.signal;

    return new Promise<() => void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        if (signal !== undefined) signal.removeEventListener("abort", abortHandler);
      };

      const abortHandler = (): void => {
        this.removeWaiter(waiter);
        cleanup();
        reject(new Error("Permintaan unduhan massal dibatalkan oleh klien"));
      };

      const timeoutHandler = (): void => {
        this.removeWaiter(waiter);
        cleanup();
        reject(
          new TooManyRequestsError(
            "Batas waktu tunggu antrean unduhan massal terlampaui, silakan coba beberapa saat lagi",
          ),
        );
      };

      if (timeoutDuration > 0) {
        timer = setTimeout(timeoutHandler, timeoutDuration);
      }

      if (signal !== undefined) {
        signal.addEventListener("abort", abortHandler, { once: true });
      }

      const waiter: QueueWaiter = {
        resolve: (releaseFn) => {
          cleanup();
          resolve(releaseFn);
        },
        timer,
        cleanup,
      };

      this.queue.push(waiter);
    });
  }

  private createReleaseFn(): () => void {
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.release();
      }
    };
  }

  private removeWaiter(target: QueueWaiter): void {
    const idx = this.queue.indexOf(target);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
    }
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next.resolve(this.createReleaseFn());
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
    for (const waiter of this.queue) {
      waiter.cleanup();
    }
    this.active = 0;
    this.queue.length = 0;
  }
}

/**
 * Default process-wide singleton semaphore for bulk download operations.
 * Applied per API instance.
 */
export const globalBulkDownloadSemaphore = new BulkDownloadSemaphore({
  maxConcurrency: DEFAULT_BULK_DOWNLOAD_MAX_CONCURRENCY,
  maxQueueLength: DEFAULT_BULK_DOWNLOAD_MAX_QUEUE_LENGTH,
  queueTimeoutMs: DEFAULT_BULK_DOWNLOAD_QUEUE_TIMEOUT_MS,
});
