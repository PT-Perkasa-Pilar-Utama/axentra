import { describe, expect, test } from "bun:test";
import { BulkDownloadByteBudget } from "./bulk-download.byte-budget";
import { BULK_DOWNLOAD_INFLIGHT_BYTES_LIMIT } from "./bulk-download.semaphore";

describe("BulkDownloadByteBudget", () => {
  test("defaults to the 512 MiB in-flight byte limit", () => {
    expect(BULK_DOWNLOAD_INFLIGHT_BYTES_LIMIT).toBe(512 * 1024 * 1024);
    expect(new BulkDownloadByteBudget().limitBytes).toBe(512 * 1024 * 1024);
  });

  test("accumulates reservations and refuses one that would exceed the limit without reserving", () => {
    const budget = new BulkDownloadByteBudget(100);

    const first = budget.tryReserve(60);
    expect(first).not.toBeNull();
    expect(budget.reservedBytes).toBe(60);

    expect(budget.tryReserve(41)).toBeNull();
    expect(budget.reservedBytes).toBe(60);

    const second = budget.tryReserve(40);
    expect(second).not.toBeNull();
    expect(budget.reservedBytes).toBe(100);
  });

  test("refuses an archive larger than the whole budget", () => {
    const budget = new BulkDownloadByteBudget(100);

    expect(budget.tryReserve(101)).toBeNull();
    expect(budget.reservedBytes).toBe(0);
  });

  test("frees the reserved bytes on release, and a release is idempotent", () => {
    const budget = new BulkDownloadByteBudget(100);
    const release = budget.tryReserve(70);
    if (release === null) throw new Error("Reservation unexpectedly refused");

    release();
    expect(budget.reservedBytes).toBe(0);

    const other = budget.tryReserve(70);
    expect(other).not.toBeNull();
    release();
    expect(budget.reservedBytes).toBe(70);
  });

  test("admits a request again once an earlier reservation is released", () => {
    const budget = new BulkDownloadByteBudget(100);
    const release = budget.tryReserve(100);
    if (release === null) throw new Error("Reservation unexpectedly refused");
    expect(budget.tryReserve(1)).toBeNull();

    release();

    expect(budget.tryReserve(100)).not.toBeNull();
  });
});
