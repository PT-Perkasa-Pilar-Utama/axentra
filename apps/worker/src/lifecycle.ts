export type WorkerLifecycle = {
  pause?: (doNotWaitActive?: boolean) => Promise<void>;
  cancelAllJobs?: (reason?: string) => void;
  close: (force?: boolean) => Promise<void>;
};

const sleep = (timeoutMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, timeoutMs));

/**
 * Stop fetching work, allow active jobs a bounded grace period, then force
 * BullMQ to close its connections. BullMQ memoizes close(), so the force close
 * must not be started after an already-pending close(false) promise.
 */
export async function closeWorkerWithinDeadline(
  worker: WorkerLifecycle,
  timeoutMs: number,
  onError?: (error: unknown) => void,
): Promise<"graceful" | "forced"> {
  const grace = worker.pause ? worker.pause(false) : Promise.resolve();
  const graceResult = (async () => {
    try {
      await grace;
      return true;
    } catch {
      return false;
    }
  })();
  const graceTimeout = (async () => {
    await sleep(timeoutMs);
    return false;
  })();
  const paused = await Promise.race([graceResult, graceTimeout]);

  if (!paused) {
    worker.cancelAllJobs?.("worker shutdown deadline exceeded");
  }

  // close(true) is the only BullMQ close call in this lifecycle. This avoids
  // the memoized close(false) promise that cannot be escalated to force=true.
  const forceClose = (async () => {
    try {
      await worker.close(true);
    } catch (error) {
      onError?.(error);
    }
  })();
  await Promise.race([forceClose, sleep(timeoutMs)]);
  return paused ? "graceful" : "forced";
}

export async function closeResourcesWithinDeadline(
  operations: Array<() => Promise<unknown>>,
  timeoutMs: number,
  onError?: (error: unknown) => void,
): Promise<boolean> {
  const cleanup = (async () => {
    await Promise.allSettled(
      operations.map(async (operation) => {
        try {
          await operation();
        } catch (error) {
          onError?.(error);
        }
      }),
    );
    return true;
  })();
  const cleanupTimeout = (async () => {
    await sleep(timeoutMs);
    return false;
  })();
  const completed = await Promise.race([cleanup, cleanupTimeout]);
  return completed;
}
