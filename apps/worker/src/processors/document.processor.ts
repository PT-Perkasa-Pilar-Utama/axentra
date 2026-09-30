import type { Logger } from "@axentra/observability";
import type { DocumentProcessingJob } from "@axentra/shared";
import type { StorageAdapter } from "@axentra/storage";
import { extractMetadataFromBuffer } from "./metadata.extractor";
import { extractDocumentBodyText } from "./document-text.extractor";
import { extractSmartTagsFromBuffer } from "./smart-tags.extractor";
import type { DocumentProcessingRepository } from "./document.processor.repository";

export * from "./document.processor.repository";

export type DocumentProcessorDependencies = {
  repository: DocumentProcessingRepository;
  storage: StorageAdapter;
  logger?: Logger | undefined;
};

/**
 * Idempotently processes a document by loading its file from storage,
 * extracting metadata (such as author) and Smart Tags (up to 3 tags),
 * persisting them atomically, and transitioning processing_status to completed.
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

  if (doc.processingStatus === "failed") {
    logger?.warn({ jobId, documentId }, "Document processing previously failed; retrying");
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

    // 6. Extract metadata, bounded body text, and smart tags
    const extracted = extractMetadataFromBuffer(file.originalName, file.mimeType, fileBuffer);
    const bodyText = extractDocumentBodyText(file.originalName, file.mimeType, fileBuffer);
    const tags = extractSmartTagsFromBuffer(file.originalName, file.mimeType, fileBuffer, bodyText);

    // 7. Persist metadata and tags and mark document completed atomically within a transaction
    await repository.completeWithMetadata(
      documentId,
      {
        author: extracted.author,
        rawMetadata: extracted.rawMetadata,
        extractedAt: extracted.extractedAt,
      },
      tags,
    );

    logger?.info(
      { jobId, documentId, author: extracted.author, tagCount: tags.length },
      "Document metadata and smart tags extraction and processing completed successfully",
    );
  } catch (error: unknown) {
    const causeMsg = (error as { cause?: { message?: string } })?.cause?.message;
    const baseMessage =
      error instanceof Error ? error.message : "Terjadi kesalahan saat memproses dokumen";
    const errorMessage =
      typeof causeMsg === "string" && causeMsg.length > 0 && !baseMessage.includes(causeMsg)
        ? `${baseMessage}: ${causeMsg}`
        : baseMessage;

    await repository.markAsFailed(documentId, errorMessage);

    logger?.error({ jobId, documentId, error }, "Document processing failed");
    throw error;
  }
}
