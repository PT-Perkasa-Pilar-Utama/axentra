import { describe, expect, it } from "bun:test";
import { createLogger } from "@axentra/observability";
import { type RetainedProcessingJob, reconcileRetainedDocumentJob } from "@axentra/queue";
import type { DocumentProcessingJob } from "@axentra/shared";
import type { StorageAdapter } from "@axentra/storage";
import { InMemoryDocumentProcessingRepository, processDocumentJob } from "./document.processor";
import { STALE_PROCESSING_THRESHOLD_MS, recoverFailedProcessingJobs } from "./processing-recovery";

const logger = createLogger({
  service: "axentra-worker",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const STUCK_DOCUMENT_ID = "77777777-7777-4777-8777-777777777777";
const STUCK_STORAGE_KEY = "documents/77777777-7777-4777-8777-777777777777/stuck.pdf";

function updatedAgo(milliseconds: number): Date {
  return new Date(Date.now() - milliseconds);
}

describe("stale processing recovery (BE-S1-02 / worker crash)", () => {
  it("re-queues a document left in processing past the 30-minute threshold, keyed by its document id", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    seedDocument(
      repository,
      STUCK_DOCUMENT_ID,
      "processing",
      updatedAgo(STALE_PROCESSING_THRESHOLD_MS + 60_000),
    );
    const enqueued: DocumentProcessingJob[] = [];

    const count = await recoverFailedProcessingJobs({
      repository,
      queue: {
        reconcileDocumentProcessing: async (payload) => {
          enqueued.push(payload);
          return payload.jobId;
        },
      },
      logger,
    });

    expect(STALE_PROCESSING_THRESHOLD_MS).toBe(30 * 60 * 1000);
    expect(count).toBe(1);
    expect(enqueued.map((job) => job.jobId)).toEqual([STUCK_DOCUMENT_ID]);
    expect(enqueued[0]?.documentId).toBe(STUCK_DOCUMENT_ID);
  });

  it("leaves a processing document alone while it is inside the 30-minute window", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    seedDocument(repository, STUCK_DOCUMENT_ID, "processing", updatedAgo(5 * 60 * 1000));
    const enqueued: DocumentProcessingJob[] = [];

    const count = await recoverFailedProcessingJobs({
      repository,
      queue: {
        reconcileDocumentProcessing: async (payload) => {
          enqueued.push(payload);
          return payload.jobId;
        },
      },
      logger,
    });

    expect(count).toBe(0);
    expect(enqueued).toHaveLength(0);
  });

  it("does not add a second runnable job for the same stale document on later sweeps", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    seedDocument(
      repository,
      STUCK_DOCUMENT_ID,
      "processing",
      updatedAgo(STALE_PROCESSING_THRESHOLD_MS + 60_000),
    );
    const jobs = new Map<string, { removed: boolean; state: string }>();
    const reconcile = queueBackedBy(jobs);

    await recoverFailedProcessingJobs({
      repository,
      queue: { reconcileDocumentProcessing: reconcile },
      logger,
    });
    const secondCount = await recoverFailedProcessingJobs({
      repository,
      queue: { reconcileDocumentProcessing: reconcile },
      logger,
    });

    expect(secondCount).toBe(1);
    expect(jobs.size).toBe(1);
    expect(jobs.get(STUCK_DOCUMENT_ID)?.state).toBe("waiting");
  });

  it("replaces a retained failed job for a stale document, and the processor then completes it", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    seedDocument(
      repository,
      STUCK_DOCUMENT_ID,
      "processing",
      updatedAgo(STALE_PROCESSING_THRESHOLD_MS + 60_000),
    );
    const jobs = new Map<string, { removed: boolean; state: string }>([
      [STUCK_DOCUMENT_ID, { removed: false, state: "failed" }],
    ]);

    const count = await recoverFailedProcessingJobs({
      repository,
      queue: { reconcileDocumentProcessing: queueBackedBy(jobs) },
      logger,
    });

    expect(count).toBe(1);
    expect(jobs.get(STUCK_DOCUMENT_ID)?.state).toBe("waiting");
    await processRecoveredJob(repository);
    expect(repository.documents.get(STUCK_DOCUMENT_ID)?.processingStatus).toBe("completed");
  });

  it("ignores completed documents even when their last update is older than the threshold", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    seedDocument(
      repository,
      STUCK_DOCUMENT_ID,
      "completed",
      updatedAgo(STALE_PROCESSING_THRESHOLD_MS * 4),
    );
    const enqueued: DocumentProcessingJob[] = [];

    const count = await recoverFailedProcessingJobs({
      repository,
      queue: {
        reconcileDocumentProcessing: async (payload) => {
          enqueued.push(payload);
          return payload.jobId;
        },
      },
      logger,
    });

    expect(count).toBe(0);
    expect(enqueued).toHaveLength(0);
  });
});

function seedDocument(
  repository: InMemoryDocumentProcessingRepository,
  documentId: string,
  status: string,
  updatedAt: Date,
): void {
  repository.documents.set(documentId, {
    id: documentId,
    title: STUCK_STORAGE_KEY,
    processingStatus: status,
    errorMessage: null,
    updatedAt,
  });
  repository.files.set(documentId, {
    id: `file-${documentId}`,
    documentId,
    storageKey: STUCK_STORAGE_KEY,
    originalName: "stuck.pdf",
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

async function processRecoveredJob(
  repository: InMemoryDocumentProcessingRepository,
): Promise<void> {
  const pdf = new TextEncoder().encode("%PDF-1.4\n/Author (Dr. Siti Rahma)\n");
  await processDocumentJob(
    {
      jobId: STUCK_DOCUMENT_ID,
      documentId: STUCK_DOCUMENT_ID,
      schemaVersion: 1,
      requestedAt: "2026-10-27T00:00:00.000Z",
      storageKey: STUCK_STORAGE_KEY,
    },
    { repository, storage: storageWith(STUCK_STORAGE_KEY, pdf) },
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
