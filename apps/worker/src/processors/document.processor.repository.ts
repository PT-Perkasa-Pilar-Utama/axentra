import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentFiles, documents } from "@axentra/db";
import { listAvailableCategories } from "./category.persistence";
import { completeDocumentWithMetadata } from "./document.processor.completion.repository";
import {
  listRecoverableProcessingDocuments,
  markEnqueueRecoveredRow,
  markRecoveryExhaustedRow,
  recordRecoveryAttemptRow,
} from "./document.processor.recovery.repository";
import type {
  CompleteDocumentMetadataInput,
  DocumentProcessingFileRecord,
  DocumentProcessingRecord,
  DocumentProcessingRepository,
  RecoverableProcessingDocument,
} from "./document.processor.repository.types";

export * from "./document.processor.repository.types";

export class DrizzleDocumentProcessingRepository implements DocumentProcessingRepository {
  public readonly createdCategoryIds: string[] = [];

  public constructor(private readonly db: PostgresJsDatabase) {}

  public async listRecoverableDocuments(
    staleProcessingBefore: Date,
  ): Promise<ReadonlyArray<RecoverableProcessingDocument>> {
    return listRecoverableProcessingDocuments(this.db, staleProcessingBefore);
  }

  public async recordRecoveryAttempt(
    documentId: string,
    staleProcessingBefore: Date,
  ): Promise<boolean> {
    return recordRecoveryAttemptRow(this.db, documentId, staleProcessingBefore);
  }

  public async markRecoveryExhausted(
    documentId: string,
    errorMessage: string,
    staleProcessingBefore: Date,
  ): Promise<boolean> {
    return markRecoveryExhaustedRow(this.db, documentId, errorMessage, staleProcessingBefore);
  }

  public async markEnqueueRecovered(documentId: string): Promise<void> {
    await markEnqueueRecoveredRow(this.db, documentId);
  }

  public async findDocumentById(id: string): Promise<DocumentProcessingRecord | null> {
    const [doc] = await this.db
      .select({
        id: documents.id,
        title: documents.title,
        processingStatus: documents.processingStatus,
      })
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    return doc ?? null;
  }

  public async findDocumentFileByDocumentId(
    documentId: string,
  ): Promise<DocumentProcessingFileRecord | null> {
    const [file] = await this.db
      .select({
        id: documentFiles.id,
        documentId: documentFiles.documentId,
        storageKey: documentFiles.storageKey,
        originalName: documentFiles.originalName,
        mimeType: documentFiles.mimeType,
      })
      .from(documentFiles)
      .where(eq(documentFiles.documentId, documentId))
      .limit(1);

    return file ?? null;
  }

  public async markAsProcessing(documentId: string): Promise<void> {
    await this.db
      .update(documents)
      .set({ processingStatus: "processing", updatedAt: new Date() })
      .where(eq(documents.id, documentId));
  }

  public async markAsFailed(documentId: string, errorMessage: string): Promise<void> {
    await this.db
      .update(documents)
      .set({
        processingStatus: "failed",
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));
  }

  public async listCategories(): Promise<ReadonlyArray<{ name: string; slug: string }>> {
    return listAvailableCategories(this.db);
  }

  public async completeWithMetadata(
    documentId: string,
    metadata: CompleteDocumentMetadataInput,
    tags?: ReadonlyArray<string> | undefined,
    category?: { name: string; slug: string } | null | undefined,
  ): Promise<void> {
    const created = await completeDocumentWithMetadata(
      this.db,
      documentId,
      metadata,
      tags,
      category,
    );
    this.createdCategoryIds.push(...created);
  }
}

export { InMemoryDocumentProcessingRepository } from "./document.processor.in-memory-repository";
