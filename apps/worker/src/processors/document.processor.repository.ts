import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentFiles, documentMetadata, documents } from "@axentra/db";

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

export type DocumentProcessingRepository = {
  findDocumentById: (id: string) => Promise<DocumentProcessingRecord | null>;
  findDocumentFileByDocumentId: (
    documentId: string,
  ) => Promise<DocumentProcessingFileRecord | null>;
  markAsProcessing: (documentId: string) => Promise<void>;
  markAsFailed: (documentId: string, errorMessage: string) => Promise<void>;
  completeWithMetadata: (
    documentId: string,
    metadata: CompleteDocumentMetadataInput,
  ) => Promise<void>;
};

export class DrizzleDocumentProcessingRepository implements DocumentProcessingRepository {
  public constructor(private readonly db: PostgresJsDatabase) {}

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

export class InMemoryDocumentProcessingRepository implements DocumentProcessingRepository {
  public readonly documents = new Map<
    string,
    DocumentProcessingRecord & { errorMessage?: string | null; updatedAt?: Date }
  >();
  public readonly files = new Map<string, DocumentProcessingFileRecord>();
  public readonly metadata = new Map<
    string,
    CompleteDocumentMetadataInput & { documentId: string; updatedAt: Date }
  >();
  public shouldFailOnComplete = false;

  public constructor(
    private readonly onMetadataSaved?: (
      documentId: string,
      metadata: CompleteDocumentMetadataInput,
    ) => Promise<void> | void,
  ) {}

  public async findDocumentById(id: string): Promise<DocumentProcessingRecord | null> {
    const doc = this.documents.get(id);
    if (!doc) return null;
    return { id: doc.id, title: doc.title, processingStatus: doc.processingStatus };
  }

  public async findDocumentFileByDocumentId(
    documentId: string,
  ): Promise<DocumentProcessingFileRecord | null> {
    const file = this.files.get(documentId);
    return file ?? null;
  }

  public async markAsProcessing(documentId: string): Promise<void> {
    const doc = this.documents.get(documentId);
    if (doc) {
      doc.processingStatus = "processing";
      doc.updatedAt = new Date();
    }
  }

  public async markAsFailed(documentId: string, errorMessage: string): Promise<void> {
    const doc = this.documents.get(documentId);
    if (doc) {
      doc.processingStatus = "failed";
      doc.errorMessage = errorMessage;
      doc.updatedAt = new Date();
    }
  }

  public async completeWithMetadata(
    documentId: string,
    metadata: CompleteDocumentMetadataInput,
  ): Promise<void> {
    if (this.shouldFailOnComplete) {
      throw new Error("Simulated transaction failure in completeWithMetadata");
    }
    const now = new Date();
    this.metadata.set(documentId, {
      documentId,
      author: metadata.author,
      rawMetadata: metadata.rawMetadata,
      extractedAt: metadata.extractedAt,
      updatedAt: now,
    });
    const doc = this.documents.get(documentId);
    if (doc) {
      doc.processingStatus = "completed";
      doc.errorMessage = null;
      doc.updatedAt = now;
    }
    await this.onMetadataSaved?.(documentId, metadata);
  }
}
