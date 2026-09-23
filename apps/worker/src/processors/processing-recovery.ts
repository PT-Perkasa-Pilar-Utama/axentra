import type { Logger } from "@axentra/observability";
import { summarizeError } from "@axentra/observability";
import type { QueueProducer } from "@axentra/queue";
import type { DocumentProcessingRepository } from "./document.processor.repository";

const RECOVERY_INTERVAL_MS = 30_000;

export type ProcessingRecoveryDependencies = {
  repository: Pick<
    DocumentProcessingRepository,
    "listRecoverableDocuments" | "markEnqueueRecovered"
  >;
  queue: Pick<QueueProducer, "reconcileDocumentProcessing">;
  logger: Logger;
};

export async function recoverFailedProcessingJobs(
  dependencies: ProcessingRecoveryDependencies,
): Promise<number> {
  const pending = await dependencies.repository.listRecoverableDocuments();
  const requestedAt = new Date().toISOString();
  let recovered = 0;

  for (const document of pending) {
    try {
      await dependencies.queue.reconcileDocumentProcessing({
        jobId: document.documentId,
        documentId: document.documentId,
        schemaVersion: 1,
        requestedAt,
        storageKey: document.storageKey,
        enqueuedAt: requestedAt,
      });
      await dependencies.repository.markEnqueueRecovered(document.documentId);
      recovered += 1;
    } catch (error) {
      dependencies.logger.error(
        { documentId: document.documentId, error: summarizeError(error) },
        "Failed to recover document processing job",
      );
    }
  }

  return recovered;
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
