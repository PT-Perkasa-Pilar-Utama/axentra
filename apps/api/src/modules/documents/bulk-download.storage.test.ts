import { describe, expect, test } from "bun:test";
import type { StorageAdapter } from "@axentra/storage";
import { getObjectWithTimeout } from "./bulk-download.storage";

describe("bulk-download storage helpers (F25)", () => {
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
