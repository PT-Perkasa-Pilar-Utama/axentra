import { describe, expect, test } from "bun:test";
import type { DocumentProcessingJob } from "@axentra/shared";
import { type RetainedProcessingJob, reconcileRetainedDocumentJob } from "../src/reconciliation";

const payload: DocumentProcessingJob = {
  jobId: "11111111-1111-4111-8111-111111111111",
  documentId: "11111111-1111-4111-8111-111111111111",
  schemaVersion: 1,
  requestedAt: "2026-09-23T00:00:00.000Z",
  storageKey: "documents/laporan.pdf",
  enqueuedAt: "2026-09-23T00:00:00.000Z",
};

function retainedJob(state: string): RetainedProcessingJob & { removed: boolean } {
  return {
    id: payload.jobId,
    removed: false,
    getState: async () => state,
    remove: async function remove(this: { removed: boolean }) {
      this.removed = true;
    },
  };
}

describe("document processing reconciliation", () => {
  test("keeps a waiting job and does not enqueue another copy", async () => {
    const waiting = retainedJob("waiting");
    const enqueued: DocumentProcessingJob[] = [];
    const jobId = await reconcileRetainedDocumentJob(
      payload,
      async () => waiting,
      async (next) => {
        enqueued.push(next);
        return next.jobId;
      },
    );

    expect(jobId).toBe(payload.jobId);
    expect(waiting.removed).toBe(false);
    expect(enqueued).toHaveLength(0);
  });

  test("replaces retained completed and failed jobs with a new runnable job", async () => {
    for (const state of ["completed", "failed"]) {
      const retained = retainedJob(state);
      const enqueued: DocumentProcessingJob[] = [];
      const jobId = await reconcileRetainedDocumentJob(
        payload,
        async () => retained,
        async (next) => {
          enqueued.push(next);
          return next.jobId;
        },
      );

      expect(jobId).toBe(payload.jobId);
      expect(retained.removed).toBe(true);
      expect(enqueued).toEqual([payload]);
    }
  });
});
