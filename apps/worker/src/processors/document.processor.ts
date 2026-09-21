import type { Logger } from "@axentra/observability";
import type { DocumentProcessingJob } from "@axentra/shared";
import type { StorageAdapter } from "@axentra/storage";
import { extractMetadataFromBuffer } from "./metadata.extractor";
import type { DocumentProcessingRepository } from "./document.processor.repository";

export * from "./document.processor.repository";

export type DocumentProcessorDependencies = {
  repository: DocumentProcessingRepository;
  storage: StorageAdapter;
  logger?: Logger | undefined;
};

/**
 * Idempotently processes a document by loading its file from storage,
 * extracting metadata (such as author), persisting it to document_metadata,
 * and transitioning documents.processing_status from queued -> processing -> completed
 * inside an atomic database transaction.
 */
export async function processDocumentJob(
  payload: DocumentProcessingJob,
  dependencies: DocumentProcessorDependencies,
): Promise<void> {
  const { repository, storage, logger } = dependencies;
  const { documentId, jobId } = payload;

  logger?.info({ jobId, documentId }, "Starting document processing");

  // 1. Fetch document record
  const doc = await repository.findDocumentById(documentId);

  if (!doc) {
    logger?.warn({ jobId, documentId }, "Document not found; aborting processing");
    return;
  }

  // 2. Idempotency check: if already completed, do not re-process
  if (doc.processingStatus === "completed") {
    logger?.info({ jobId, documentId }, "Document already processed and completed; skipping");
    return;
  }

  // 3. Mark document as currently processing
  await repository.markAsProcessing(documentId);

  try {
    // 4. Fetch associated document file
    const file = await repository.findDocumentFileByDocumentId(documentId);

    if (!file) {
      const missingError = "File dokumen tidak ditemukan pada penyimpanan data";
      await repository.markAsFailed(documentId, missingError);
      logger?.error({ jobId, documentId }, missingError);
      return;
    }

    // 5. Read file buffer from object storage
    const fileBuffer = await storage.getObject(file.storageKey);

    // 6. Extract metadata
    const extracted = extractMetadataFromBuffer(file.originalName, file.mimeType, fileBuffer);

    // 7. Persist metadata and mark document completed atomically within a transaction
    await repository.completeWithMetadata(documentId, {
      author: extracted.author,
      rawMetadata: extracted.rawMetadata,
      extractedAt: extracted.extractedAt,
    });

    logger?.info(
      { jobId, documentId, author: extracted.author },
      "Document metadata extraction and processing completed successfully",
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Terjadi kesalahan saat memproses dokumen";
    await repository.markAsFailed(documentId, errorMessage);

    logger?.error({ jobId, documentId, error }, "Document processing failed");
    throw error;
  }
}
