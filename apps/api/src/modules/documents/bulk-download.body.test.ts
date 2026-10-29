import { describe, expect, test } from "bun:test";
import { BulkDownloadByteBudget } from "./bulk-download.byte-budget";
import { createBulkDownloadBody } from "./bulk-download.body";
import { BulkDownloadSemaphore } from "./bulk-download.semaphore";

const ARCHIVE = new Uint8Array(200 * 1024).map((_, index) => index % 251);

function reserve(budget: BulkDownloadByteBudget, bytes: number): () => void {
  const release = budget.tryReserve(bytes);
  if (release === null) throw new Error("Reservation unexpectedly refused");
  return release;
}

describe("bulk download response body and slot lifetime (D24)", () => {
  test("streams the complete archive and keeps the slot after the body is fully read", async () => {
    const semaphore = new BulkDownloadSemaphore({ maxConcurrency: 2 });
    const release = await semaphore.acquire();
    const body = createBulkDownloadBody(ARCHIVE, {
      release,
      chunkBytes: 10_000,
      transferTimeoutMs: 60,
    });

    expect(semaphore.activeCount).toBe(1);
    const received = new Uint8Array(await new Response(body).arrayBuffer());

    expect(received.byteLength).toBe(ARCHIVE.byteLength);
    expect(received.every((byte, index) => byte === ARCHIVE[index])).toBe(true);
    // Bun drains the stream within milliseconds, before the client has received the bytes, so draining
    // is not a release point. The slot is released only by cancel, abort, or the transfer window.
    expect(semaphore.activeCount).toBe(1);
    await Bun.sleep(120);
    expect(semaphore.activeCount).toBe(0);
  });

  test("releases the slot when the consumer cancels the unread body", async () => {
    const semaphore = new BulkDownloadSemaphore({ maxConcurrency: 1 });
    const release = await semaphore.acquire();
    const body = createBulkDownloadBody(ARCHIVE, { release });

    await body.cancel();

    expect(semaphore.activeCount).toBe(0);
  });

  test("releases the slot when the 60-second transfer timer fires, using a short injected timeout", async () => {
    const semaphore = new BulkDownloadSemaphore({ maxConcurrency: 1 });
    const release = await semaphore.acquire();
    const body = createBulkDownloadBody(ARCHIVE, { release, transferTimeoutMs: 20 });

    await Bun.sleep(60);

    expect(semaphore.activeCount).toBe(0);
    const reader = body.getReader();
    await expect(reader.read()).rejects.toThrow("Batas waktu transfer unduhan massal terlampaui");
  });

  test("releases the slot when the request signal aborts mid-transfer", async () => {
    const semaphore = new BulkDownloadSemaphore({ maxConcurrency: 1 });
    const release = await semaphore.acquire();
    const controller = new AbortController();
    const body = createBulkDownloadBody(ARCHIVE, {
      release,
      signal: controller.signal,
      chunkBytes: 1024,
    });
    const reader = body.getReader();
    await reader.read();

    controller.abort();

    expect(semaphore.activeCount).toBe(0);
    await expect(reader.read()).rejects.toThrow("Transfer unduhan massal dibatalkan oleh klien");
  });

  test("releases the slot at once when the request signal is already aborted", async () => {
    const semaphore = new BulkDownloadSemaphore({ maxConcurrency: 1 });
    const release = await semaphore.acquire();
    const controller = new AbortController();
    controller.abort();

    createBulkDownloadBody(ARCHIVE, { release, signal: controller.signal });

    expect(semaphore.activeCount).toBe(0);
  });

  test("a third request waits after both bodies are drained and is admitted when the first window ends", async () => {
    const semaphore = new BulkDownloadSemaphore({
      maxConcurrency: 2,
      maxQueueLength: 10,
      queueTimeoutMs: 5_000,
    });
    const firstBody = createBulkDownloadBody(ARCHIVE, {
      release: await semaphore.acquire(),
      transferTimeoutMs: 60,
    });
    const secondBody = createBulkDownloadBody(ARCHIVE, { release: await semaphore.acquire() });

    let thirdAcquired = false;
    const thirdRelease = (async () => {
      const release = await semaphore.acquire();
      thirdAcquired = true;
      return release;
    })();
    await Bun.sleep(10);

    expect(thirdAcquired).toBe(false);
    expect(semaphore.activeCount).toBe(2);
    expect(semaphore.queueLength).toBe(1);

    await new Response(firstBody).arrayBuffer();
    await Bun.sleep(10);
    expect(thirdAcquired).toBe(false);

    const release = await thirdRelease;

    expect(thirdAcquired).toBe(true);
    release();
    await secondBody.cancel();
    expect(semaphore.activeCount).toBe(0);
  });
});

describe("bulk download byte reservation lifetime (inflight byte budget)", () => {
  test("holds the reservation while the body is unread and after it is drained, until the window ends", async () => {
    const budget = new BulkDownloadByteBudget(ARCHIVE.byteLength * 2);
    const body = createBulkDownloadBody(ARCHIVE, {
      release: reserve(budget, ARCHIVE.byteLength),
      chunkBytes: 10_000,
      transferTimeoutMs: 60,
    });

    expect(budget.reservedBytes).toBe(ARCHIVE.byteLength);
    await new Response(body).arrayBuffer();

    expect(budget.reservedBytes).toBe(ARCHIVE.byteLength);
    await Bun.sleep(120);
    expect(budget.reservedBytes).toBe(0);
  });

  test("releases the reservation when the consumer cancels the unread body", async () => {
    const budget = new BulkDownloadByteBudget(ARCHIVE.byteLength);
    const body = createBulkDownloadBody(ARCHIVE, { release: reserve(budget, ARCHIVE.byteLength) });

    await body.cancel();

    expect(budget.reservedBytes).toBe(0);
  });

  test("releases the reservation when the 60-second transfer timer fires (injected short timeout)", async () => {
    const budget = new BulkDownloadByteBudget(ARCHIVE.byteLength);
    const body = createBulkDownloadBody(ARCHIVE, {
      release: reserve(budget, ARCHIVE.byteLength),
      transferTimeoutMs: 20,
    });

    await Bun.sleep(60);

    expect(budget.reservedBytes).toBe(0);
    await expect(body.getReader().read()).rejects.toThrow(
      "Batas waktu transfer unduhan massal terlampaui",
    );
  });

  test("releases the reservation when the request signal aborts mid-transfer", async () => {
    const budget = new BulkDownloadByteBudget(ARCHIVE.byteLength);
    const controller = new AbortController();
    const body = createBulkDownloadBody(ARCHIVE, {
      release: reserve(budget, ARCHIVE.byteLength),
      signal: controller.signal,
      chunkBytes: 1024,
    });
    const reader = body.getReader();
    await reader.read();

    controller.abort();

    expect(budget.reservedBytes).toBe(0);
  });

  test("calls release once even when the body ends and the timer later fires", async () => {
    const budget = new BulkDownloadByteBudget(ARCHIVE.byteLength * 2);
    const releaseReservation = reserve(budget, ARCHIVE.byteLength);
    const other = reserve(budget, ARCHIVE.byteLength);
    const body = createBulkDownloadBody(ARCHIVE, {
      release: releaseReservation,
      transferTimeoutMs: 20,
    });

    await new Response(body).arrayBuffer();
    await Bun.sleep(40);

    expect(budget.reservedBytes).toBe(ARCHIVE.byteLength);
    other();
    expect(budget.reservedBytes).toBe(0);
  });
});
