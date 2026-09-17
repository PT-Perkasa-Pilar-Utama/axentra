import type { ReadinessData } from "@axentra/shared";

export type DependencyCheck = {
  name: "database" | "redis" | "storage";
  check: () => Promise<void>;
};

export type ReadinessResult = {
  ready: boolean;
  data: ReadinessData;
};

async function runWithTimeout(check: () => Promise<void>, timeoutMs: number): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      check(),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Dependency check timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export async function evaluateReadiness(
  service: string,
  version: string,
  checks: ReadonlyArray<DependencyCheck>,
  timeoutMs = 1500,
): Promise<ReadinessResult> {
  const entries = await Promise.all(
    checks.map(async (dependency) => {
      try {
        await runWithTimeout(dependency.check, timeoutMs);
        return [dependency.name, "ready"] as const;
      } catch {
        return [dependency.name, "unavailable"] as const;
      }
    }),
  );
  const dependencies = Object.fromEntries(entries);
  const ready = entries.every(([, state]) => state === "ready");
  return {
    ready,
    data: {
      status: ready ? "ready" : "not_ready",
      service,
      version,
      dependencies,
    },
  };
}
