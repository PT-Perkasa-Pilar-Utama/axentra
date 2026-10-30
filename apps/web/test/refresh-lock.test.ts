import { afterEach, describe, expect, test } from "bun:test";
import { AUTH_REFRESH_LOCK_NAME, runWithRefreshLock } from "../src/features/auth/refresh-lock";
import { createDeferred, createFakeLockManager, installNavigatorLocks } from "./auth-test-support";

let restoreLocks: (() => void) | null = null;

function useNavigatorLocks(value: Parameters<typeof installNavigatorLocks>[0]): void {
  restoreLocks = installNavigatorLocks(value);
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  restoreLocks?.();
  restoreLocks = null;
});

describe("runWithRefreshLock: cross-tab refresh serialization (F9)", () => {
  test("runs the task inside the named lock when navigator.locks exists", async () => {
    const locks = createFakeLockManager();
    useNavigatorLocks(locks);
    const observed: number[] = [];

    const result = await runWithRefreshLock(async () => {
      observed.push(locks.running());
      return "selesai";
    });

    expect(result).toBe("selesai");
    expect(locks.requests).toEqual([AUTH_REFRESH_LOCK_NAME]);
    expect(observed).toEqual([1]);
    expect(locks.running()).toBe(0);
  });

  test("a second tab waits until the first tab releases the lock", async () => {
    const locks = createFakeLockManager();
    useNavigatorLocks(locks);
    const firstTabGate = createDeferred<void>();
    const order: string[] = [];

    const firstTab = runWithRefreshLock(async () => {
      order.push("tab-1:mulai");
      await firstTabGate.promise;
      order.push("tab-1:selesai");
    });
    const secondTab = runWithRefreshLock(async () => {
      order.push("tab-2:mulai");
      order.push("tab-2:selesai");
    });
    await settle();

    expect(order).toEqual(["tab-1:mulai"]);

    firstTabGate.resolve();
    await Promise.all([firstTab, secondTab]);

    expect(order).toEqual(["tab-1:mulai", "tab-1:selesai", "tab-2:mulai", "tab-2:selesai"]);
    expect(locks.peakRunning()).toBe(1);
  });

  test("a failing task rejects to the caller and still releases the lock", async () => {
    const locks = createFakeLockManager();
    useNavigatorLocks(locks);

    await expect(
      runWithRefreshLock(async () => {
        throw new Error("refresh gagal");
      }),
    ).rejects.toThrow("refresh gagal");
    const next = await runWithRefreshLock(async () => "lanjut");

    expect(next).toBe("lanjut");
    expect(locks.running()).toBe(0);
  });

  test("runs the task directly when navigator.locks is null (single flight stays in the tab)", async () => {
    useNavigatorLocks(null);

    const result = await runWithRefreshLock(async () => "tanpa-lock");

    expect(result).toBe("tanpa-lock");
  });

  test("runs the task directly when navigator.locks is undefined (insecure context)", async () => {
    useNavigatorLocks(undefined);

    const result = await runWithRefreshLock(async () => "tanpa-lock");

    expect(result).toBe("tanpa-lock");
  });
});
