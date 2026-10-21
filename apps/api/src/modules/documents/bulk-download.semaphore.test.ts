import { describe, expect, test } from "bun:test";
import { TooManyRequestsError } from "../../http/errors";
import { BulkDownloadSemaphore } from "./bulk-download.semaphore";

describe("BulkDownloadSemaphore (F7, F10)", () => {
  test("allows up to maxConcurrency concurrent acquisitions immediately", async () => {
    const semaphore = new BulkDownloadSemaphore({ maxConcurrency: 2, maxQueueLength: 5 });

    const release1 = await semaphore.acquire();
    expect(semaphore.activeCount).toBe(1);
    expect(semaphore.queueLength).toBe(0);

    const release2 = await semaphore.acquire();
    expect(semaphore.activeCount).toBe(2);
    expect(semaphore.queueLength).toBe(0);

    release1();
    expect(semaphore.activeCount).toBe(1);

    release2();
    expect(semaphore.activeCount).toBe(0);
  });

  test("queues requests when concurrency is saturated and resolves on release", async () => {
    const semaphore = new BulkDownloadSemaphore({ maxConcurrency: 1, maxQueueLength: 5 });

    const release1 = await semaphore.acquire();
    expect(semaphore.activeCount).toBe(1);

    let acquired2 = false;
    const acquireSecond = async (): Promise<() => void> => {
      const rel = await semaphore.acquire();
      acquired2 = true;
      return rel;
    };
    const p2 = acquireSecond();

    expect(acquired2).toBe(false);
    expect(semaphore.queueLength).toBe(1);

    // Release slot 1, slot 2 should unblock
    release1();
    const release2 = await p2;
    expect(acquired2).toBe(true);
    expect(semaphore.queueLength).toBe(0);
    expect(semaphore.activeCount).toBe(1);

    release2();
    expect(semaphore.activeCount).toBe(0);
  });

  test("throws TooManyRequestsError when queue capacity is exceeded", async () => {
    const semaphore = new BulkDownloadSemaphore({ maxConcurrency: 1, maxQueueLength: 1 });

    const release1 = await semaphore.acquire();
    const p2 = semaphore.acquire(); // fills queue (length 1)
    expect(semaphore.queueLength).toBe(1);

    // Third acquire should exceed queue capacity
    await expect(semaphore.acquire()).rejects.toThrow(TooManyRequestsError);

    release1();
    const release2 = await p2;
    release2();
  });

  test("release function is idempotent", async () => {
    const semaphore = new BulkDownloadSemaphore({ maxConcurrency: 2 });
    const release = await semaphore.acquire();
    expect(semaphore.activeCount).toBe(1);

    release();
    expect(semaphore.activeCount).toBe(0);

    // Subsequent calls to release should do nothing
    release();
    expect(semaphore.activeCount).toBe(0);
  });

  test("reset properly clears active count and queue", async () => {
    const semaphore = new BulkDownloadSemaphore({ maxConcurrency: 1, maxQueueLength: 2 });
    await semaphore.acquire();
    void semaphore.acquire();
    expect(semaphore.activeCount).toBe(1);
    expect(semaphore.queueLength).toBe(1);

    semaphore.reset();
    expect(semaphore.activeCount).toBe(0);
    expect(semaphore.queueLength).toBe(0);
  });
});
