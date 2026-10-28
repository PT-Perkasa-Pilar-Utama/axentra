import type { Logger } from "@axentra/observability";
import { summarizeError } from "@axentra/observability";
import type { QueueProducer } from "@axentra/queue";
import type {
  DocumentProcessingRepository,
  RecoverableProcessingDocument,
} from "./document.processor.repository.types";
import { PROCESSING_RECOVERY_EXHAUSTED_MESSAGE } from "./processing-failure";

const RECOVERY_INTERVAL_MS = 30_000;

// A document still 'processing' this long after its last update has lost its worker. Its job id is
// the document id, so reconciliation never adds a second runnable job for the same document.
export const STALE_PROCESSING_THRESHOLD_MS = 30 * 60 * 1000;

// A stranded document is re-enqueued at most this many times. Each claim restarts the stale clock, so a
// document that takes its worker down on every run is failed after this many 30-minute windows.
export const MAX_PROCESSING_RECOVERY_ATTEMPTS = 3;

export type ProcessingRecoveryRepository = Pick<
  DocumentProcessingRepository,
  | "listRecoverableDocuments"
  | "recordRecoveryAttempt"
  | "markRecoveryExhausted"
  | "markEnqueueRecovered"
>;

export type ProcessingRecoveryDependencies = {
  repository: ProcessingRecoveryRepository;
  queue: Pick<QueueProducer, "reconcileDocumentProcessing">;
  logger: Logger;
};

/**
 * One recovery sweep. Returns how many documents were handed to the queue. Queued documents are only
 * reconciled; stranded 'processing' and enqueue-failed documents are claimed, counted, and logged.
 */
export async function recoverFailedProcessingJobs(
  dependencies: ProcessingRecoveryDependencies,
): Promise<number> {
  const nowMs = Date.now();
  const staleProcessingBefore = new Date(nowMs - STALE_PROCESSING_THRESHOLD_MS);
  const candidates = await dependencies.repository.listRecoverableDocuments(staleProcessingBefore);
  let recovered = 0;

  for (const document of candidates) {
    try {
      if (await recoverDocument(dependencies, document, staleProcessingBefore, nowMs)) {
        recovered += 1;
      }
    } catch (error) {
      dependencies.logger.error(
        { documentId: document.documentId, error: summarizeError(error) },
        "Failed to recover document processing job",
      );
    }
  }

  return recovered;
}

async function recoverDocument(
  dependencies: ProcessingRecoveryDependencies,
  document: RecoverableProcessingDocument,
  staleProcessingBefore: Date,
  nowMs: number,
): Promise<boolean> {
  // A queued document keeps its runnable job, so reconciling it again is a no-op. It is not counted: a
  // backlog can keep a document queued for hours, and counting would fail it while its job still waits.
  if (document.processingStatus === "queued") {
    await reenqueue(dependencies, document);
    return true;
  }

  const { repository, logger } = dependencies;
  const documentAgeMs = nowMs - document.createdAt.getTime();
  const sinceLastUpdateMs = nowMs - document.updatedAt.getTime();
  const details = {
    documentId: document.documentId,
    previousStatus: document.processingStatus,
    recoveryAttempts: document.recoveryAttempts,
    documentAgeMs,
    sinceLastUpdateMs,
  };

  if (document.recoveryAttempts >= MAX_PROCESSING_RECOVERY_ATTEMPTS) {
    const exhausted = await repository.markRecoveryExhausted(
      document.documentId,
      PROCESSING_RECOVERY_EXHAUSTED_MESSAGE,
      staleProcessingBefore,
    );
    if (exhausted) {
      logger.error(
        details,
        "Document processing recovery attempts exhausted; document marked failed",
      );
    }
    return false;
  }

  const claimed = await repository.recordRecoveryAttempt(
    document.documentId,
    staleProcessingBefore,
  );
  if (!claimed) return false;

  await reenqueue(dependencies, document);
  logger.warn(
    { ...details, recoveryAttempt: document.recoveryAttempts + 1 },
    "Re-enqueued stranded document processing job",
  );
  return true;
}

async function reenqueue(
  dependencies: ProcessingRecoveryDependencies,
  document: RecoverableProcessingDocument,
): Promise<void> {
  const requestedAt = new Date().toISOString();
  await dependencies.queue.reconcileDocumentProcessing({
    jobId: document.documentId,
    documentId: document.documentId,
    schemaVersion: 1,
    requestedAt,
    storageKey: document.storageKey,
    enqueuedAt: requestedAt,
  });
  if (document.processingStatus === "failed") {
    await dependencies.repository.markEnqueueRecovered(document.documentId);
  }
}

async function runRecoveryCycle(dependencies: ProcessingRecoveryDependencies): Promise<void> {
  try {
    await recoverFailedProcessingJobs(dependencies);
  } catch (error) {
    dependencies.logger.error(
      { error: summarizeError(error) },
      "Document processing recovery cycle failed",
    );
  }
}

export function startProcessingRecovery(dependencies: ProcessingRecoveryDependencies): () => void {
  const runCycle = (): void => {
    void runRecoveryCycle(dependencies);
  };
  runCycle();
  const timer = setInterval(runCycle, RECOVERY_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
