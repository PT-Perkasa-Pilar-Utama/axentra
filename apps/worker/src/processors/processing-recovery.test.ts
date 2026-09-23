import { describe, expect, it } from "bun:test";
import { createLogger } from "@axentra/observability";
import { type RetainedProcessingJob, reconcileRetainedDocumentJob } from "@axentra/queue";
import { PROCESSING_ENQUEUE_FAILURE_MESSAGE, type DocumentProcessingJob } from "@axentra/shared";
import type { StorageAdapter } from "@axentra/storage";
import { InMemoryDocumentProcessingRepository, processDocumentJob } from "./document.processor";
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
        listRecoverableDocuments: async () => [
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
        listRecoverableDocuments: async () => [
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

  it("returns a queued document to queued after a runnable job is reconciled", async () => {
    const recovered: string[] = [];
    const count = await recoverFailedProcessingJobs({
      repository: {
        listRecoverableDocuments: async () => [
          {
            documentId: "33333333-3333-4333-8333-333333333333",
            storageKey: "documents/queued.pdf",
          },
        ],
        markEnqueueRecovered: async (documentId) => {
          recovered.push(documentId);
        },
      },
      queue: {
        reconcileDocumentProcessing: async (payload) => payload.jobId,
      },
      logger,
    });

    expect(count).toBe(1);
    expect(recovered).toEqual(["33333333-3333-4333-8333-333333333333"]);
  });

  it("replaces a retained terminal job and the processor completes the document [BE-S1-02]", async () => {
    for (const terminalState of ["completed", "failed"]) {
      const documentId = "44444444-4444-4444-8444-444444444444";
      const storageKey = "documents/stranded.pdf";
      const repository = queuedDocument(documentId, storageKey, "queued", null);
      const jobs = new Map<string, { removed: boolean; state: string }>([
        [documentId, { removed: false, state: terminalState }],
      ]);

      const count = await recoverFailedProcessingJobs({
        repository,
        queue: { reconcileDocumentProcessing: queueBackedBy(jobs) },
        logger,
      });

      expect(count).toBe(1);
      expect(jobs.get(documentId)?.state).toBe("waiting");
      await finishRunnableJob(repository, documentId, storageKey);
      expect(repository.documents.get(documentId)?.processingStatus).toBe("completed");
    }
  });

  it("completes a queued document when the enqueue-failure status write never landed [BE-S1-02]", async () => {
    const documentId = "55555555-5555-4555-8555-555555555555";
    const storageKey = "documents/status-write.pdf";
    const repository = queuedDocument(documentId, storageKey, "queued", null);
    const jobs = new Map<string, { removed: boolean; state: string }>();

    const count = await recoverFailedProcessingJobs({
      repository,
      queue: { reconcileDocumentProcessing: queueBackedBy(jobs) },
      logger,
    });

    expect(count).toBe(1);
    expect(jobs.get(documentId)?.state).toBe("waiting");
    await finishRunnableJob(repository, documentId, storageKey);
    expect(repository.documents.get(documentId)?.processingStatus).toBe("completed");
  });

  it("completes every file after the second batch enqueue fails [BE-S1-02]", async () => {
    const firstId = "66666666-6666-4666-8666-666666666661";
    const secondId = "66666666-6666-4666-8666-666666666662";
    const repository = new InMemoryDocumentProcessingRepository();
    seedDocument(repository, firstId, "documents/satu.docx", "queued", null);
    seedDocument(
      repository,
      secondId,
      "documents/dua.docx",
      "failed",
      PROCESSING_ENQUEUE_FAILURE_MESSAGE,
    );
    const jobs = new Map<string, { removed: boolean; state: string }>([
      [firstId, { removed: false, state: "waiting" }],
    ]);

    const count = await recoverFailedProcessingJobs({
      repository,
      queue: { reconcileDocumentProcessing: queueBackedBy(jobs) },
      logger,
    });

    expect(count).toBe(2);
    expect(jobs.get(firstId)?.removed).toBe(false);
    expect(jobs.get(secondId)?.state).toBe("waiting");
    expect(repository.documents.get(secondId)?.processingStatus).toBe("queued");
    await finishRunnableJob(repository, firstId, "documents/satu.docx");
    await finishRunnableJob(repository, secondId, "documents/dua.docx");
    expect(repository.documents.get(firstId)?.processingStatus).toBe("completed");
    expect(repository.documents.get(secondId)?.processingStatus).toBe("completed");
  });
});

function queuedDocument(
  documentId: string,
  storageKey: string,
  status: string,
  errorMessage: string | null,
): InMemoryDocumentProcessingRepository {
  const repository = new InMemoryDocumentProcessingRepository();
  seedDocument(repository, documentId, storageKey, status, errorMessage);
  return repository;
}

function seedDocument(
  repository: InMemoryDocumentProcessingRepository,
  documentId: string,
  storageKey: string,
  status: string,
  errorMessage: string | null,
): void {
  repository.documents.set(documentId, {
    id: documentId,
    title: storageKey,
    processingStatus: status,
    errorMessage,
  });
  repository.files.set(documentId, {
    id: `file-${documentId}`,
    documentId,
    storageKey,
    originalName: storageKey,
    mimeType: "application/pdf",
  });
}

function queueBackedBy(
  jobs: Map<string, { removed: boolean; state: string }>,
): (payload: DocumentProcessingJob) => Promise<string> {
  return async (payload) =>
    reconcileRetainedDocumentJob(
      payload,
      async (jobId) => {
        const retained = jobs.get(jobId);
        if (retained === undefined) return undefined;
        const job: RetainedProcessingJob = {
          id: jobId,
          getState: async () => retained.state,
          remove: async () => {
            retained.removed = true;
            jobs.delete(jobId);
          },
        };
        return job;
      },
      async (next) => {
        jobs.set(next.jobId, { removed: false, state: "waiting" });
        return next.jobId;
      },
    );
}

async function finishRunnableJob(
  repository: InMemoryDocumentProcessingRepository,
  documentId: string,
  storageKey: string,
): Promise<void> {
  const pdf = new TextEncoder().encode("%PDF-1.4\n/Author (Dr. Siti Rahma)\n");
  await processDocumentJob(
    {
      jobId: documentId,
      documentId,
      schemaVersion: 1,
      requestedAt: "2026-09-23T00:00:00.000Z",
      storageKey,
    },
    { repository, storage: storageWith(storageKey, pdf) },
  );
}

function storageWith(storageKey: string, body: Uint8Array): StorageAdapter {
  return {
    initialize: async () => undefined,
    checkHealth: async () => undefined,
    putObject: async () => undefined,
    getObject: async (key) => {
      if (key !== storageKey) throw new Error("Object not found in mock storage");
      return body;
    },
    deleteObject: async () => undefined,
    headObject: async () => ({
      key: storageKey,
      contentLength: body.byteLength,
      contentType: "application/pdf",
      checksumSha256: undefined,
    }),
    createDownloadUrl: async () => "https://example.com/download",
    close: async () => undefined,
  };
}
