import { TooManyRequestsError } from "./errors";

export type RequestSemaphoreMessages = {
  // 429 message when the wait queue is full.
  readonly queueFull: string;
  // 429 message when a queued request waits longer than queueTimeoutMs.
  readonly queueTimeout: string;
  // Message of the error thrown when the request signal aborts before a slot is granted.
  readonly aborted: string;
};

export type RequestSemaphoreOptions = {
  readonly maxConcurrency: number;
  readonly maxQueueLength: number;
  readonly queueTimeoutMs: number;
  readonly messages: RequestSemaphoreMessages;
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
 * In-process async semaphore that admits at most `maxConcurrency` holders per API instance, queues up
 * to `maxQueueLength` waiters in FIFO order, and refuses the rest with 429 (TooManyRequestsError).
 */
export class RequestSemaphore {
  public readonly maxConcurrency: number;
  public readonly maxQueueLength: number;
  public readonly queueTimeoutMs: number;

  private readonly messages: RequestSemaphoreMessages;
  private active = 0;
  private readonly queue: Array<QueueWaiter> = [];

  public constructor(options: RequestSemaphoreOptions) {
    this.maxConcurrency = options.maxConcurrency;
    this.maxQueueLength = options.maxQueueLength;
    this.queueTimeoutMs = options.queueTimeoutMs;
    this.messages = options.messages;
  }

  /**
   * Acquires a slot and returns an idempotent release function.
   * If concurrency is saturated, waits in queue until a slot frees up.
   * If queue capacity is exceeded, throws TooManyRequestsError (429).
   * If waiting in queue exceeds timeout, throws TooManyRequestsError (429).
   * If signal aborts while in queue, cancels the waiter immediately.
   */
  public async acquire(options?: SemaphoreAcquireOptions): Promise<() => void> {
    if (options?.signal?.aborted) {
      throw new Error(this.messages.aborted);
    }

    if (this.active < this.maxConcurrency) {
      this.active++;
      return this.createReleaseFn();
    }

    if (this.queue.length >= this.maxQueueLength) {
      throw new TooManyRequestsError(this.messages.queueFull);
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
        reject(new Error(this.messages.aborted));
      };

      const timeoutHandler = (): void => {
        this.removeWaiter(waiter);
        cleanup();
        reject(new TooManyRequestsError(this.messages.queueTimeout));
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
