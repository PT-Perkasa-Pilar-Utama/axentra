import type { Logger } from "@axentra/observability";
import { summarizeError } from "@axentra/observability";
import type { DocumentProcessingJob } from "@axentra/shared";
import type { StorageAdapter } from "@axentra/storage";
import { extractMetadataFromBuffer } from "./metadata.extractor";
import { extractDocumentBodyText } from "./document-text.extractor";
import { extractSmartTagsFromBuffer } from "./smart-tags.extractor";
import { extractCategoryFromBuffer } from "./category.extractor";
import type { DocumentProcessingRepository } from "./document.processor.repository";
import { DocumentProcessingFailedError, PROCESSING_FAILURE_MESSAGE } from "./processing-failure";

export * from "./document.processor.repository";

export type DocumentProcessorDependencies = {
  repository: DocumentProcessingRepository;
  storage: StorageAdapter;
  logger?: Logger | undefined;
};

/**
 * Idempotently processes a document by loading its file from storage,
 * extracting metadata, Smart Tags, and category (per AC-05.01, AC-05.02),
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

    // 6. Extract metadata, bounded body text, smart tags, and category (AC-05.01, AC-05.02)
    const extracted = extractMetadataFromBuffer(file.originalName, file.mimeType, fileBuffer);
    const bodyText = extractDocumentBodyText(file.originalName, file.mimeType, fileBuffer);
    const tags = extractSmartTagsFromBuffer(file.originalName, file.mimeType, fileBuffer, bodyText);
    const existingCats = repository.listCategories ? await repository.listCategories() : undefined;
    const category = extractCategoryFromBuffer(
      file.originalName,
      file.mimeType,
      fileBuffer,
      bodyText,
      existingCats,
    );

    // 7. Persist metadata, tags, and category and mark document completed atomically within a transaction
    await repository.completeWithMetadata(
      documentId,
      {
        author: extracted.author,
        rawMetadata: extracted.rawMetadata,
        extractedAt: extracted.extractedAt,
        extractedText: bodyText,
      },
      tags,
      category,
    );

    logger?.info(
      {
        jobId,
        documentId,
        author: extracted.author,
        tagCount: tags.length,
        category: category?.name ?? null,
      },
      "Document metadata, smart tags, and category processing completed successfully",
    );
  } catch (error: unknown) {
    // Only the fixed copy is stored or rethrown. Driver errors carry SQL text and parameters, and
    // storage errors can carry object keys, so their messages never leave this function.
    await repository.markAsFailed(documentId, PROCESSING_FAILURE_MESSAGE);

    logger?.error(
      { jobId, documentId, error: summarizeError(error) },
      "Document processing failed",
    );
    throw new DocumentProcessingFailedError();
  }
}
