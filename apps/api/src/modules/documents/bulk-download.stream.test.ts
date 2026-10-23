import { describe, expect, test } from "bun:test";
import type { StorageAdapter } from "@axentra/storage";
import { createMonitoredZipStream, getObjectWithTimeout } from "./bulk-download.stream";

describe("bulk-download.stream (F24, F25)", () => {
  test("yields complete buffer and releases slot on normal stream completion", async () => {
    let released = false;
    const testBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const stream = createMonitoredZipStream(
      testBytes,
      () => {
        released = true;
      },
      { chunkSize: 3 },
    );

    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    expect(released).toBe(true);
    const combined = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    expect(combined).toEqual(testBytes);
  });

  test("releases slot when stream is cancelled prematurely (client disconnect) (F24)", async () => {
    let released = false;
    const testBytes = new Uint8Array(1024 * 1024); // 1 MB
    const stream = createMonitoredZipStream(
      testBytes,
      () => {
        released = true;
      },
      { chunkSize: 64 * 1024 },
    );

    const reader = stream.getReader();
    const firstChunk = await reader.read();
    expect(firstChunk.value?.length).toBe(64 * 1024);
    expect(released).toBe(false);

    await reader.cancel();
    expect(released).toBe(true);
  });

  test("releases slot when transfer timeout fires (slow/stalled client) (F24, F25)", async () => {
    let released = false;
    const testBytes = new Uint8Array(1024);
    createMonitoredZipStream(
      testBytes,
      () => {
        released = true;
      },
      { chunkSize: 100, transferTimeoutMs: 20 },
    );

    expect(released).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    expect(released).toBe(true);
  });

  test("releases slot when signal aborts", () => {
    let released = false;
    const controller = new AbortController();
    const testBytes = new Uint8Array([1, 2, 3]);

    createMonitoredZipStream(
      testBytes,
      () => {
        released = true;
      },
      { signal: controller.signal },
    );

    expect(released).toBe(false);
    controller.abort();
    expect(released).toBe(true);
  });

  test("getObjectWithTimeout returns bytes when storage resolves quickly", async () => {
    const mockStorage: StorageAdapter = {
      initialize: async () => {},
      checkHealth: async () => {},
      putObject: async () => {},
      getObject: async () => new Uint8Array([10, 20, 30]),
      deleteObject: async () => {},
      headObject: async () => ({
        key: "key1.pdf",
        contentLength: 3,
        contentType: "application/pdf",
        checksumSha256: undefined,
      }),
      createDownloadUrl: async () => "https://example.com",
      close: async () => {},
    };

    const bytes = await getObjectWithTimeout(mockStorage, "key1.pdf", 500);
    expect(bytes).toEqual(new Uint8Array([10, 20, 30]));
  });

  test("getObjectWithTimeout throws when storage retrieval times out (F25)", async () => {
    const hangingStorage: StorageAdapter = {
      initialize: async () => {},
      checkHealth: async () => {},
      putObject: async () => {},
      getObject: async () => new Promise<Uint8Array>(() => {}), // never resolves
      deleteObject: async () => {},
      headObject: async () => ({
        key: "hang.pdf",
        contentLength: 0,
        contentType: "application/pdf",
        checksumSha256: undefined,
      }),
      createDownloadUrl: async () => "https://example.com",
      close: async () => {},
    };

    await expect(getObjectWithTimeout(hangingStorage, "hang.pdf", 25)).rejects.toThrow(
      /Storage retrieval timed out after 25ms/,
    );
  });
});
