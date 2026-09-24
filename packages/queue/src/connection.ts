import Redis from "ioredis";
import type { RedisOptions } from "ioredis";

export function redisConnectionOptions(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl);
  const options: RedisOptions = {
    host: url.hostname,
    port: url.port === "" ? 6379 : Number(url.port),
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
  if (url.username !== "") options.username = decodeURIComponent(url.username);
  if (url.password !== "") options.password = decodeURIComponent(url.password);
  if (url.protocol === "rediss:") options.tls = {};
  return options;
}

export type RedisProbe = {
  checkHealth: () => Promise<void>;
  close: () => Promise<void>;
};

const wait = (timeoutMs: number): Promise<false> =>
  new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));

async function ensureConnected(client: Redis, timeoutMs: number): Promise<void> {
  if (client.status === "ready") return;
  if (client.status === "wait" || client.status === "close" || client.status === "end") {
    const res = await Promise.race([client.connect(), wait(timeoutMs)]);
    if (res === false) throw new Error("Redis connection timed out");
    return;
  }
  if (
    client.status === "connecting" ||
    client.status === "connect" ||
    client.status === "reconnecting"
  ) {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const onReady = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onError = (err: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("Redis connection timed out"));
      }, timeoutMs);
      const cleanup = (): void => {
        client.removeListener("ready", onReady);
        client.removeListener("error", onError);
        client.removeListener("end", onError);
        clearTimeout(timer);
      };
      client.once("ready", onReady);
      client.once("error", onError);
      client.once("end", onError);
    });
  }
}

export function createRedisProbe(redisUrl: string, healthTimeoutMs = 1500): RedisProbe {
  const timeoutMs = Math.max(1, healthTimeoutMs);
  const client = new Redis({
    ...redisConnectionOptions(redisUrl),
    connectTimeout: timeoutMs,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  // ioredis emits connection errors independently of commands. A listener is
  // required even though health callers translate the failure into a status.
  client.on("error", () => undefined);

  return {
    async checkHealth(): Promise<void> {
      await ensureConnected(client, timeoutMs);
      const response = await Promise.race([client.ping(), wait(timeoutMs)]);
      if (response === false) throw new Error("Redis health check timed out");
      if (response !== "PONG") throw new Error("Redis did not return PONG");
    },
    async close(): Promise<void> {
      try {
        if (client.status !== "wait") {
          await Promise.race([client.quit(), wait(timeoutMs)]);
        }
      } catch {
        // Closing an already-unavailable Redis connection is best effort.
      } finally {
        client.disconnect();
      }
    },
  };
}
