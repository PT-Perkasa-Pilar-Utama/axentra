import { describe, expect, test } from "bun:test";
import {
  createRedisProbe,
  queueCommandConnectionOptions,
  redisConnectionOptions,
} from "../src/connection";

describe("Redis connection boundary", () => {
  test("parses Redis URLs including TLS and database selection", () => {
    const options = redisConnectionOptions("rediss://queue-user:queue-pass@example.test:6380/3");

    expect(options.host).toBe("example.test");
    expect(options.port).toBe(6380);
    expect(options.db).toBe(3);
    expect(options.username).toBe("queue-user");
    expect(options.password).toBe("queue-pass");
    expect(options.tls).toEqual({});
  });

  test("bounds queue commands when Redis is unavailable", () => {
    const options = queueCommandConnectionOptions("redis://127.0.0.1:6399/0", 1500);

    expect(options.connectTimeout).toBe(1500);
    expect(options.commandTimeout).toBe(1500);
    expect(options.maxRetriesPerRequest).toBe(1);
    expect(options.enableOfflineQueue).toBe(false);
  });

  test("bounds an unavailable Redis health probe", async () => {
    const probe = createRedisProbe("redis://127.0.0.1:6399/0", 250);
    const startedAt = Date.now();
    try {
      await expect(probe.checkHealth()).rejects.toThrow();
    } finally {
      await probe.close();
    }

    expect(Date.now() - startedAt).toBeLessThan(2000);
  });
});
