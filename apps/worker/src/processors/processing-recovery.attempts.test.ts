import { describe, expect, it } from "bun:test";
import { createLogger } from "@axentra/observability";
import { PROCESSING_ENQUEUE_FAILURE_MESSAGE, type DocumentProcessingJob } from "@axentra/shared";
import { InMemoryDocumentProcessingRepository } from "./document.processor";
import { PROCESSING_RECOVERY_EXHAUSTED_MESSAGE } from "./processing-failure";
import {
  MAX_PROCESSING_RECOVERY_ATTEMPTS,
  STALE_PROCESSING_THRESHOLD_MS,
  recoverFailedProcessingJobs,
} from "./processing-recovery";

const DOCUMENT_ID = "99999999-9999-4999-8999-999999999999";
const STORAGE_KEY = "documents/99999999-9999-4999-8999-999999999999/tertahan.pdf";
const HOUR_MS = 60 * 60 * 1000;
const STALE_AGE_MS = STALE_PROCESSING_THRESHOLD_MS + 60_000;

function agoMs(milliseconds: number): Date {
  return new Date(Date.now() - milliseconds);
}

function capturingLogger(): { logger: ReturnType<typeof createLogger>; lines: string[] } {
  const lines: string[] = [];
  const logger = createLogger({
    service: "axentra-worker",
    environment: "test",
    version: "0.1.0",
    level: "info",
    destination: {
      write(chunk: string): void {
        lines.push(chunk);
      },
    },
  });
  return { logger, lines };
}

function seed(
  repository: InMemoryDocumentProcessingRepository,
  overrides: {
    status: string;
    updatedAt: Date;
    createdAt?: Date;
    errorMessage?: string | null;
    attempts?: number;
  },
): void {
  repository.documents.set(DOCUMENT_ID, {
    id: DOCUMENT_ID,
    title: "tertahan.pdf",
    processingStatus: overrides.status,
    errorMessage: overrides.errorMessage ?? null,
    createdAt: overrides.createdAt ?? overrides.updatedAt,
    updatedAt: overrides.updatedAt,
    processingRecoveryAttempts: overrides.attempts ?? 0,
  });
  repository.files.set(DOCUMENT_ID, {
    id: "file-99999999",
    documentId: DOCUMENT_ID,
    storageKey: STORAGE_KEY,
    originalName: "tertahan.pdf",
    mimeType: "application/pdf",
  });
}

function recordingQueue(): {
  enqueued: DocumentProcessingJob[];
  queue: { reconcileDocumentProcessing: (payload: DocumentProcessingJob) => Promise<string> };
} {
  const enqueued: DocumentProcessingJob[] = [];
  return {
    enqueued,
    queue: {
      reconcileDocumentProcessing: async (payload) => {
        enqueued.push(payload);
        return payload.jobId;
      },
    },
  };
}

function parseLogLines(lines: ReadonlyArray<string>): unknown[] {
  return lines
    .join("")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

async function flushLogger(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("processing recovery attempt budget (F21)", () => {
  it("counts each stale re-enqueue and warns with the document id and its age", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    seed(repository, {
      status: "processing",
      createdAt: agoMs(2 * HOUR_MS),
      updatedAt: agoMs(STALE_AGE_MS),
    });
    const { enqueued, queue } = recordingQueue();
    const { logger, lines } = capturingLogger();

    const count = await recoverFailedProcessingJobs({ repository, queue, logger });
    await flushLogger();

    expect(count).toBe(1);
    expect(enqueued.map((job) => job.jobId)).toEqual([DOCUMENT_ID]);
    expect(repository.documents.get(DOCUMENT_ID)?.processingRecoveryAttempts).toBe(1);
    expect(parseLogLines(lines)).toContainEqual(
      expect.objectContaining({
        msg: "Re-enqueued stranded document processing job",
        documentId: DOCUMENT_ID,
        previousStatus: "processing",
        recoveryAttempt: 1,
        documentAgeMs: expect.any(Number),
        sinceLastUpdateMs: expect.any(Number),
      }),
    );
    expect(lines.join("")).not.toContain(STORAGE_KEY);
  });

  it("does not re-enqueue once the attempt budget is spent and fails the document with the fixed copy", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    seed(repository, {
      status: "processing",
      updatedAt: agoMs(STALE_AGE_MS),
      attempts: MAX_PROCESSING_RECOVERY_ATTEMPTS,
    });
    const { enqueued, queue } = recordingQueue();
    const { logger, lines } = capturingLogger();

    const count = await recoverFailedProcessingJobs({ repository, queue, logger });
    await flushLogger();

    expect(count).toBe(0);
    expect(enqueued).toHaveLength(0);
    const stored = repository.documents.get(DOCUMENT_ID);
    expect(stored?.processingStatus).toBe("failed");
    expect(stored?.errorMessage).toBe(PROCESSING_RECOVERY_EXHAUSTED_MESSAGE);
    expect(parseLogLines(lines)).toContainEqual(
      expect.objectContaining({
        msg: "Document processing recovery attempts exhausted; document marked failed",
        documentId: DOCUMENT_ID,
        recoveryAttempts: MAX_PROCESSING_RECOVERY_ATTEMPTS,
      }),
    );
  });

  it("fails a document that keeps stalling after the maximum number of re-enqueues", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    seed(repository, { status: "processing", updatedAt: agoMs(STALE_AGE_MS) });
    const { enqueued, queue } = recordingQueue();
    const { logger } = capturingLogger();

    // Each sweep stands in for a 30-minute window in which the worker crashed without finishing.
    for (let sweep = 0; sweep < 10; sweep += 1) {
      const stored = repository.documents.get(DOCUMENT_ID);
      if (stored?.processingStatus === "processing") {
        stored.updatedAt = agoMs(STALE_AGE_MS);
      }
      await recoverFailedProcessingJobs({ repository, queue, logger });
    }

    expect(enqueued).toHaveLength(MAX_PROCESSING_RECOVERY_ATTEMPTS);
    const stored = repository.documents.get(DOCUMENT_ID);
    expect(stored?.processingStatus).toBe("failed");
    expect(stored?.errorMessage).toBe(PROCESSING_RECOVERY_EXHAUSTED_MESSAGE);
    expect(stored?.processingRecoveryAttempts).toBe(MAX_PROCESSING_RECOVERY_ATTEMPTS);
  });

  it("bounds an enqueue outage the same way and ends with the fixed copy", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    seed(repository, {
      status: "failed",
      errorMessage: PROCESSING_ENQUEUE_FAILURE_MESSAGE,
      updatedAt: agoMs(1_000),
    });
    let enqueueAttempts = 0;
    const { logger } = capturingLogger();

    for (let sweep = 0; sweep < 10; sweep += 1) {
      await recoverFailedProcessingJobs({
        repository,
        queue: {
          reconcileDocumentProcessing: async () => {
            enqueueAttempts += 1;
            throw new Error("redis unavailable");
          },
        },
        logger,
      });
    }

    expect(enqueueAttempts).toBe(MAX_PROCESSING_RECOVERY_ATTEMPTS);
    const stored = repository.documents.get(DOCUMENT_ID);
    expect(stored?.processingStatus).toBe("failed");
    expect(stored?.errorMessage).toBe(PROCESSING_RECOVERY_EXHAUSTED_MESSAGE);
  });

  it("reconciles a queued document on every sweep without counting it or warning", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    seed(repository, { status: "queued", updatedAt: agoMs(3 * HOUR_MS) });
    const { enqueued, queue } = recordingQueue();
    const { logger, lines } = capturingLogger();

    for (let sweep = 0; sweep < 5; sweep += 1) {
      await recoverFailedProcessingJobs({ repository, queue, logger });
    }
    await flushLogger();

    expect(enqueued).toHaveLength(5);
    expect(repository.documents.get(DOCUMENT_ID)?.processingRecoveryAttempts).toBe(0);
    expect(repository.documents.get(DOCUMENT_ID)?.processingStatus).toBe("queued");
    expect(lines.join("")).not.toContain("Re-enqueued stranded document processing job");
  });
});
