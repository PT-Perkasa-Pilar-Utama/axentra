import { PROCESSING_ENQUEUE_FAILURE_MESSAGE } from "@axentra/shared";
import type {
  CompleteDocumentMetadataInput,
  DocumentProcessingFileRecord,
  DocumentProcessingRecord,
  DocumentProcessingRepository,
  RecoverableProcessingDocument,
} from "./document.processor.repository.types";

type InMemoryDocument = DocumentProcessingRecord & {
  categoryId?: string | null;
  errorMessage?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  processingRecoveryAttempts?: number;
};

export class InMemoryDocumentProcessingRepository implements DocumentProcessingRepository {
  public readonly documents = new Map<string, InMemoryDocument>();
  public readonly files = new Map<string, DocumentProcessingFileRecord>();
  public readonly metadata = new Map<
    string,
    CompleteDocumentMetadataInput & { documentId: string; updatedAt: Date }
  >();
  public readonly documentTags = new Map<string, ReadonlyArray<string>>();
  public readonly categories = new Map<string, { id: string; name: string; slug: string }>();
  public readonly permissions = new Map<
    string,
    { id: string; categoryId: string; downloadEnabled: boolean }
  >();
  public shouldFailOnComplete = false;
  public readonly createdCategoryIds: string[] = [];

  public constructor(
    private readonly onMetadataSaved?: (
      documentId: string,
      metadata: CompleteDocumentMetadataInput,
    ) => Promise<void> | void,
    private readonly onTagsSaved?: (
      documentId: string,
      tags: ReadonlyArray<string>,
    ) => Promise<void> | void,
    private readonly onCategorySaved?: (
      documentId: string,
      category: { id: string; name: string; slug: string; downloadEnabled: boolean },
    ) => Promise<void> | void,
  ) {}

  // Same rule as the Drizzle store: an enqueue-failed row, or a 'processing' row not updated since the stale clock.
  private isClaimable(document: InMemoryDocument, staleProcessingBefore: Date): boolean {
    if (document.processingStatus === "failed") {
      return document.errorMessage === PROCESSING_ENQUEUE_FAILURE_MESSAGE;
    }
    return (
      document.processingStatus === "processing" &&
      document.updatedAt !== undefined &&
      document.updatedAt < staleProcessingBefore
    );
  }

  public async listRecoverableDocuments(
    staleProcessingBefore: Date,
  ): Promise<ReadonlyArray<RecoverableProcessingDocument>> {
    const now = new Date();
    const recoverable: RecoverableProcessingDocument[] = [];
    for (const [documentId, document] of this.documents) {
      const file = this.files.get(documentId);
      const queued = document.processingStatus === "queued";
      if (file === undefined || !(queued || this.isClaimable(document, staleProcessingBefore))) {
        continue;
      }
      recoverable.push({
        documentId,
        storageKey: file.storageKey,
        processingStatus: document.processingStatus,
        createdAt: document.createdAt ?? now,
        updatedAt: document.updatedAt ?? now,
        recoveryAttempts: document.processingRecoveryAttempts ?? 0,
      });
    }
    return recoverable;
  }

  public async recordRecoveryAttempt(
    documentId: string,
    staleProcessingBefore: Date,
  ): Promise<boolean> {
    const document = this.documents.get(documentId);
    if (document === undefined || !this.isClaimable(document, staleProcessingBefore)) return false;
    document.processingRecoveryAttempts = (document.processingRecoveryAttempts ?? 0) + 1;
    document.updatedAt = new Date();
    return true;
  }

  public async markRecoveryExhausted(
    documentId: string,
    errorMessage: string,
    staleProcessingBefore: Date,
  ): Promise<boolean> {
    const document = this.documents.get(documentId);
    if (document === undefined || !this.isClaimable(document, staleProcessingBefore)) return false;
    document.processingStatus = "failed";
    document.errorMessage = errorMessage;
    document.updatedAt = new Date();
    return true;
  }

  public async markEnqueueRecovered(documentId: string): Promise<void> {
    const document = this.documents.get(documentId);
    if (
      document?.processingStatus === "failed" &&
      document.errorMessage === PROCESSING_ENQUEUE_FAILURE_MESSAGE
    ) {
      document.processingStatus = "queued";
      document.errorMessage = null;
    }
  }

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

  public async listCategories(): Promise<ReadonlyArray<{ name: string; slug: string }>> {
    return Array.from(this.categories.values()).map((c) => ({
      name: c.name,
      slug: c.slug,
    }));
  }

  public async completeWithMetadata(
    documentId: string,
    metadata: CompleteDocumentMetadataInput,
    tags?: ReadonlyArray<string> | undefined,
    category?: { name: string; slug: string } | null | undefined,
  ): Promise<void> {
    if (this.shouldFailOnComplete) {
      throw new Error("Simulated transaction failure in completeWithMetadata");
    }
    const now = new Date();
    this.metadata.set(documentId, {
      documentId,
      author: metadata.author,
      extractedText: metadata.extractedText,
      rawMetadata: metadata.rawMetadata,
      extractedAt: metadata.extractedAt,
      updatedAt: now,
    });
    if (tags) {
      const capped = tags.slice(0, 3);
      this.documentTags.set(documentId, capped);
      await this.onTagsSaved?.(documentId, capped);
    }
    let categoryId: string | null = null;
    if (category) {
      const existing = Array.from(this.categories.values()).find(
        (c) => c.slug === category.slug || c.name === category.name,
      );
      if (existing) {
        categoryId = existing.id;
      } else {
        const newId = crypto.randomUUID();
        this.categories.set(newId, {
          id: newId,
          name: category.name,
          slug: category.slug,
        });
        this.permissions.set(newId, {
          id: crypto.randomUUID(),
          categoryId: newId,
          downloadEnabled: false,
        });
        categoryId = newId;
        this.createdCategoryIds.push(newId);
        await this.onCategorySaved?.(documentId, {
          id: newId,
          name: category.name,
          slug: category.slug,
          downloadEnabled: false,
        });
      }
    }
    const doc = this.documents.get(documentId);
    if (doc) {
      doc.processingStatus = "completed";
      doc.errorMessage = null;
      doc.updatedAt = now;
      if (categoryId) {
        doc.categoryId = categoryId;
      }
    }
    await this.onMetadataSaved?.(documentId, metadata);
  }
}
