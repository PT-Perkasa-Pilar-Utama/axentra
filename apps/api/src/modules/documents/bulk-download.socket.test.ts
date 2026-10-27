import { describe, expect, test } from "bun:test";
import net from "node:net";
import { createLogger } from "@axentra/observability";
import type { StorageAdapter } from "@axentra/storage";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { createDocumentService } from "./documents.service";
import { InMemoryDownloadRepository } from "./download.repository";
import { BulkDownloadSemaphore } from "./bulk-download.semaphore";

const TEST_DOC_ID = "11111111-1111-4111-8111-111111111111";

const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const tokenVerifier: TokenVerifier = {
  verifyToken(token: string) {
    if (token === "member-token") {
      return {
        id: "usr-member-1",
        email: "member@axentra.local",
        role: "member_team",
        name: "Member User",
      };
    }
    return null;
  },
};

describe("POST /api/v1/documents/bulk-download — Socket Concurrency & Header Contract", () => {
  test("bounds active prefetch and archive assembly slots and rejects flood with 429 over real TCP sockets", async () => {
    const payloadSize = 64 * 1024;
    const dummyBytes = new Uint8Array(payloadSize);

    let releaseGate!: () => void;
    const gatePromise = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    let activeHeldCount = 0;
    const mockStorage: StorageAdapter = {
      initialize: async () => {},
      checkHealth: async () => {},
      putObject: async () => {},
      getObject: async () => {
        // Deterministically hold the first 2 acquired slots until the full client flood arrives
        if (activeHeldCount < 2) {
          activeHeldCount++;
          await gatePromise;
        }
        return dummyBytes;
      },
      deleteObject: async () => {},
      headObject: async (key: string) => ({
        key,
        contentLength: payloadSize,
        contentType: "application/octet-stream",
        checksumSha256: undefined,
      }),
      createDownloadUrl: async (key: string) => `https://mock-storage.local/${key}`,
      close: async () => {},
    };

    const downloadRepo = new InMemoryDownloadRepository();
    downloadRepo.setTarget(TEST_DOC_ID, {
      document: {
        id: TEST_DOC_ID,
        title: "Test Doc",
        categoryId: "cat-1",
        processingStatus: "completed",
        deletedAt: null,
      },
      file: {
        id: "file-test-1",
        storageKey: "storage/test-doc.bin",
        originalName: "test-doc.bin",
        mimeType: "application/octet-stream",
        fileSize: payloadSize,
        fileExtension: "bin",
      },
      categoryPermission: { downloadEnabled: true },
    });

    const semaphore = new BulkDownloadSemaphore({
      maxConcurrency: 2,
      maxQueueLength: 10,
      queueTimeoutMs: 10_000,
    });

    const documentService = createDocumentService({
      storage: mockStorage,
      downloadRepository: downloadRepo,
      bulkDownloadSemaphore: semaphore,
      logger: testLogger,
    });

    const app = createApp({
      documentService,
      tokenVerifier,
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
    });

    const server = Bun.serve({
      port: 0,
      fetch: app.fetch,
    });

    const requestBody = JSON.stringify({ documentIds: [TEST_DOC_ID] });
    const requestHeaders = [
      "POST /api/v1/documents/bulk-download HTTP/1.1",
      "Host: localhost",
      "Authorization: Bearer member-token",
      "Content-Type: application/json",
      `Content-Length: ${Buffer.byteLength(requestBody)}`,
      "Connection: close",
      "",
      requestBody,
    ].join("\r\n");

    const totalClients = 20;
    const clients: Array<net.Socket> = [];
    let responses429Count = 0;
    const completedResponses: Array<string> = [];
    const clientPromises: Array<Promise<void>> = [];

    const serverPort = server.port;
    if (serverPort === undefined) {
      throw new Error("Server port was not assigned by Bun.serve");
    }

    for (let i = 0; i < totalClients; i++) {
      let resolveClient!: () => void;
      const promise = new Promise<void>((resolve) => {
        resolveClient = resolve;
      });
      clientPromises.push(promise);

      const client = net.createConnection({ port: serverPort }, () => {
        client.write(requestHeaders);
      });

      let responseBuffer = "";
      let countedAs429 = false;
      client.on("data", (chunk) => {
        responseBuffer += chunk.toString();
        if (
          !countedAs429 &&
          (responseBuffer.includes("429 Too Many Requests") ||
            responseBuffer.includes("TOO_MANY_REQUESTS"))
        ) {
          countedAs429 = true;
          responses429Count++;
        }
      });

      client.on("end", () => {
        completedResponses.push(responseBuffer);
        resolveClient();
      });

      client.on("error", () => {
        completedResponses.push(responseBuffer);
        resolveClient();
      });

      clients.push(client);
    }

    // Wait until all 20 requests hit the server and settle into active, queued, and rejected states
    const timeoutAt = Date.now() + 5000;
    while ((semaphore.queueLength < 10 || responses429Count < 8) && Date.now() < timeoutAt) {
      await Bun.sleep(10);
    }

    // Verify deterministic concurrency bounds:
    // Concurrency limit is strictly 2, queue limit is 10, remaining 8 are rejected with 429
    expect(semaphore.activeCount).toBe(2);
    expect(semaphore.queueLength).toBe(10);
    expect(responses429Count).toBe(8);

    // Release the gate so held active requests and subsequent queued requests can complete
    releaseGate();

    await Promise.all(clientPromises);

    // After all clients complete, all slots and queues must be released
    expect(semaphore.activeCount).toBe(0);
    expect(semaphore.queueLength).toBe(0);

    // Verify real Content-Length header is present and chunked transfer encoding is absent on 200 OK responses
    const okResponses = completedResponses.filter((r) => r.includes("200 OK"));
    expect(okResponses.length).toBe(12);
    for (const res of okResponses) {
      expect(res.toLowerCase()).toContain("content-length:");
      expect(res.toLowerCase()).not.toContain("transfer-encoding: chunked");
    }

    server.stop(true);
    for (const client of clients) {
      client.destroy();
    }
  });
});
