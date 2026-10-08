import { PROCESSING_ENQUEUE_FAILURE_MESSAGE } from "@axentra/shared";
import type {
  CompleteDocumentMetadataInput,
  DocumentProcessingFileRecord,
  DocumentProcessingRecord,
  DocumentProcessingRepository,
  FailedProcessingDocument,
} from "./document.processor.repository";

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
  public readonly documentTags = new Map<string, ReadonlyArray<string>>();
  public shouldFailOnComplete = false;

  public constructor(
    private readonly onMetadataSaved?: (
      documentId: string,
      metadata: CompleteDocumentMetadataInput,
    ) => Promise<void> | void,
    private readonly onTagsSaved?: (
      documentId: string,
      tags: ReadonlyArray<string>,
    ) => Promise<void> | void,
  ) {}

  public readonly enqueueFailures: FailedProcessingDocument[] = [];

  public async listRecoverableDocuments(): Promise<ReadonlyArray<FailedProcessingDocument>> {
    if (this.enqueueFailures.length > 0) return [...this.enqueueFailures];
    const recoverable: FailedProcessingDocument[] = [];
    for (const [documentId, document] of this.documents) {
      const stranded =
        document.processingStatus === "queued" ||
        (document.processingStatus === "failed" &&
          document.errorMessage === PROCESSING_ENQUEUE_FAILURE_MESSAGE);
      const file = this.files.get(documentId);
      if (!stranded || file === undefined) continue;
      recoverable.push({ documentId, storageKey: file.storageKey });
    }
    return recoverable;
  }

  public async markEnqueueRecovered(documentId: string): Promise<void> {
    const document = this.documents.get(documentId);
    if (document?.processingStatus === "failed") {
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

  public async completeWithMetadata(
    documentId: string,
    metadata: CompleteDocumentMetadataInput,
    tags?: ReadonlyArray<string> | undefined,
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
    const doc = this.documents.get(documentId);
    if (doc) {
      doc.processingStatus = "completed";
      doc.errorMessage = null;
      doc.updatedAt = now;
    }
    await this.onMetadataSaved?.(documentId, metadata);
  }
}
