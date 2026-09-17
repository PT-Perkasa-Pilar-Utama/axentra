import { describe, expect, test } from "bun:test";
import { closeResourcesWithinDeadline, closeWorkerWithinDeadline } from "./lifecycle";

describe("worker shutdown lifecycle", () => {
  test("gracefully pauses active work before force-closing connections", async () => {
    const calls: string[] = [];
    const worker = {
      pause: async () => {
        calls.push("pause");
      },
      close: async (force?: boolean) => {
        calls.push(force ? "close-force" : "close-graceful");
      },
    };

    await expect(closeWorkerWithinDeadline(worker, 20)).resolves.toBe("graceful");
    expect(calls).toEqual(["pause", "close-force"]);
  });

  test("cancels active work when the grace deadline is exceeded", async () => {
    const calls: string[] = [];
    const worker = {
      pause: () => new Promise<void>(() => undefined),
      cancelAllJobs: (reason?: string) => calls.push(reason ?? "cancel"),
      close: async (force?: boolean) => {
        calls.push(force ? "close-force" : "close-graceful");
      },
    };

    await expect(closeWorkerWithinDeadline(worker, 5)).resolves.toBe("forced");
    expect(calls).toEqual(["worker shutdown deadline exceeded", "close-force"]);
  });

  test("does not wait forever for a broken resource close", async () => {
    const completed = await closeResourcesWithinDeadline(
      [() => new Promise<void>(() => undefined)],
      5,
    );
    expect(completed).toBe(false);
  });
});
