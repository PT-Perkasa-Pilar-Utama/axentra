import { describe, expect, it } from "bun:test";
import { createLogger } from "@axentra/observability";
import type { DocumentProcessingJob } from "@axentra/shared";
import { recoverFailedProcessingJobs } from "./processing-recovery";

const logger = createLogger({
  service: "axentra-worker",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

describe("document processing recovery", () => {
  it("re-enqueues only documents left failed by an enqueue outage", async () => {
    const recovered: DocumentProcessingJob[] = [];
    const count = await recoverFailedProcessingJobs({
      repository: {
        listEnqueueFailedDocuments: async () => [
          {
            documentId: "11111111-1111-4111-8111-111111111111",
            storageKey: "documents/11111111-1111-4111-8111-111111111111/laporan.pdf",
          },
        ],
        markEnqueueRecovered: async () => undefined,
      },
      queue: {
        reconcileDocumentProcessing: async (payload) => {
          recovered.push(payload);
          return payload.jobId;
        },
      },
      logger,
    });

    expect(count).toBe(1);
    expect(recovered[0]?.jobId).toBe("11111111-1111-4111-8111-111111111111");
    expect(recovered[0]?.documentId).toBe(recovered[0]?.jobId);
  });

  it("keeps the recovery cycle alive when one document cannot be re-enqueued", async () => {
    const count = await recoverFailedProcessingJobs({
      repository: {
        listEnqueueFailedDocuments: async () => [
          {
            documentId: "11111111-1111-4111-8111-111111111111",
            storageKey: "documents/one.pdf",
          },
          {
            documentId: "22222222-2222-4222-8222-222222222222",
            storageKey: "documents/two.pdf",
          },
        ],
        markEnqueueRecovered: async () => undefined,
      },
      queue: {
        reconcileDocumentProcessing: async (payload) => {
          if (payload.documentId.startsWith("11111111")) {
            throw new Error("redis unavailable");
          }
          return payload.jobId;
        },
      },
      logger,
    });

    expect(count).toBe(1);
  });
});
