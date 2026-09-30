import { and, eq, isNull, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  documentFiles,
  documentMetadata,
  documentSmartTags,
  documents,
  smartTags,
} from "@axentra/db";
import { PROCESSING_ENQUEUE_FAILURE_MESSAGE } from "@axentra/shared";

export type DocumentProcessingRecord = {
  id: string;
  title: string;
  processingStatus: string;
};

export type DocumentProcessingFileRecord = {
  id: string;
  documentId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
};

export type CompleteDocumentMetadataInput = {
  author: string | null;
  rawMetadata: Record<string, unknown>;
  extractedAt: Date;
};

export type FailedProcessingDocument = {
  documentId: string;
  storageKey: string;
};

export type DocumentProcessingRepository = {
  listRecoverableDocuments: () => Promise<ReadonlyArray<FailedProcessingDocument>>;
  markEnqueueRecovered: (documentId: string) => Promise<void>;
  findDocumentById: (id: string) => Promise<DocumentProcessingRecord | null>;
  findDocumentFileByDocumentId: (
    documentId: string,
  ) => Promise<DocumentProcessingFileRecord | null>;
  markAsProcessing: (documentId: string) => Promise<void>;
  markAsFailed: (documentId: string, errorMessage: string) => Promise<void>;
  completeWithMetadata: (
    documentId: string,
    metadata: CompleteDocumentMetadataInput,
    tags?: ReadonlyArray<string> | undefined,
  ) => Promise<void>;
};

export class DrizzleDocumentProcessingRepository implements DocumentProcessingRepository {
  public constructor(private readonly db: PostgresJsDatabase) {}

  public async listRecoverableDocuments(): Promise<ReadonlyArray<FailedProcessingDocument>> {
    return this.db
      .select({
        documentId: documents.id,
        storageKey: documentFiles.storageKey,
      })
      .from(documents)
      .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
      .where(
        and(
          isNull(documents.deletedAt),
          or(
            eq(documents.processingStatus, "queued"),
            and(
              eq(documents.processingStatus, "failed"),
              eq(documents.errorMessage, PROCESSING_ENQUEUE_FAILURE_MESSAGE),
            ),
          ),
        ),
      );
  }

  public async markEnqueueRecovered(documentId: string): Promise<void> {
    await this.db
      .update(documents)
      .set({
        processingStatus: "queued",
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.processingStatus, "failed"),
          eq(documents.errorMessage, PROCESSING_ENQUEUE_FAILURE_MESSAGE),
        ),
      );
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

  public async completeWithMetadata(
    documentId: string,
    metadata: CompleteDocumentMetadataInput,
    tags?: ReadonlyArray<string> | undefined,
  ): Promise<void> {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .insert(documentMetadata)
        .values({
          documentId,
          author: metadata.author,
          rawMetadata: metadata.rawMetadata,
          extractedAt: metadata.extractedAt,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: documentMetadata.documentId,
          set: {
            author: metadata.author,
            rawMetadata: metadata.rawMetadata,
            extractedAt: metadata.extractedAt,
            updatedAt: now,
          },
        });

      if (tags && tags.length > 0) {
        for (const tagName of tags.slice(0, 3)) {
          await tx
            .insert(smartTags)
            .values({ name: tagName })
            .onConflictDoNothing({ target: smartTags.name });

          const [tagRecord] = await tx
            .select({ id: smartTags.id })
            .from(smartTags)
            .where(eq(smartTags.name, tagName))
            .limit(1);

          if (tagRecord) {
            await tx
              .insert(documentSmartTags)
              .values({
                documentId,
                tagId: tagRecord.id,
                createdAt: now,
              })
              .onConflictDoNothing({
                target: [documentSmartTags.documentId, documentSmartTags.tagId],
              });
          }
        }
      }

      await tx
        .update(documents)
        .set({
          processingStatus: "completed",
          errorMessage: null,
          updatedAt: now,
        })
        .where(eq(documents.id, documentId));
    });
  }
}

export { InMemoryDocumentProcessingRepository } from "./document.processor.in-memory-repository";
