import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentFiles, documentMetadata, documents } from "@axentra/db";
import type { Logger } from "@axentra/observability";
import type { DocumentProcessingJob } from "@axentra/shared";
import type { StorageAdapter } from "@axentra/storage";
import { extractMetadataFromBuffer } from "./metadata.extractor";

export type DocumentProcessorDependencies = {
  db: PostgresJsDatabase;
  storage: StorageAdapter;
  logger?: Logger | undefined;
};

/**
 * Idempotently processes a document by loading its file from storage,
 * extracting metadata (such as author), persisting it to document_metadata,
 * and transitioning documents.processing_status from queued -> processing -> completed.
 */
export async function processDocumentJob(
  payload: DocumentProcessingJob,
  dependencies: DocumentProcessorDependencies,
): Promise<void> {
  const { db, storage, logger } = dependencies;
  const { documentId, jobId } = payload;

  logger?.info({ jobId, documentId }, "Starting document processing");

  // 1. Fetch document record
  const [doc] = await db
    .select({
      id: documents.id,
      title: documents.title,
      processingStatus: documents.processingStatus,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

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
  await db
    .update(documents)
    .set({ processingStatus: "processing", updatedAt: new Date() })
    .where(eq(documents.id, documentId));

  try {
    // 4. Fetch associated document file
    const [file] = await db
      .select({
        id: documentFiles.id,
        storageKey: documentFiles.storageKey,
        originalName: documentFiles.originalName,
        mimeType: documentFiles.mimeType,
      })
      .from(documentFiles)
      .where(eq(documentFiles.documentId, documentId))
      .limit(1);

    if (!file) {
      const missingError = "File dokumen tidak ditemukan pada penyimpanan data";
      await db
        .update(documents)
        .set({
          processingStatus: "failed",
          errorMessage: missingError,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));
      logger?.error({ jobId, documentId }, missingError);
      return;
    }

    // 5. Read file buffer from object storage
    const fileBuffer = await storage.getObject(file.storageKey);

    // 6. Extract metadata
    const extracted = extractMetadataFromBuffer(file.originalName, file.mimeType, fileBuffer);

    // 7. Persist metadata atomically with upsert
    const now = new Date();
    await db
      .insert(documentMetadata)
      .values({
        documentId,
        author: extracted.author,
        rawMetadata: extracted.rawMetadata,
        extractedAt: extracted.extractedAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: documentMetadata.documentId,
        set: {
          author: extracted.author,
          rawMetadata: extracted.rawMetadata,
          extractedAt: extracted.extractedAt,
          updatedAt: now,
        },
      });

    // 8. Transition document status to terminal completed
    await db
      .update(documents)
      .set({
        processingStatus: "completed",
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(documents.id, documentId));

    logger?.info(
      { jobId, documentId, author: extracted.author },
      "Document metadata extraction and processing completed successfully",
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Terjadi kesalahan saat memproses dokumen";
    await db
      .update(documents)
      .set({
        processingStatus: "failed",
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    logger?.error({ jobId, documentId, error }, "Document processing failed");
    throw error;
  }
}
