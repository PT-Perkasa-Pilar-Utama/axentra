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
  extractedText?: string | null | undefined;
};

/** A document the recovery sweep may re-enqueue or, once its attempts run out, fail. */
export type RecoverableProcessingDocument = {
  documentId: string;
  storageKey: string;
  processingStatus: string;
  createdAt: Date;
  updatedAt: Date;
  /** How many recovery re-enqueues this document has already had. */
  recoveryAttempts: number;
};

export type DocumentProcessingRepository = {
  /**
   * Queued documents, plus documents stranded in 'processing' since before `staleProcessingBefore`,
   * plus documents failed by an enqueue outage.
   */
  listRecoverableDocuments: (
    staleProcessingBefore: Date,
  ) => Promise<ReadonlyArray<RecoverableProcessingDocument>>;
  /**
   * Counts one recovery attempt and restarts the stale clock (updated_at). Applies to stale
   * 'processing' rows and to rows failed by an enqueue outage. Resolves false when the row no longer
   * matches, so only one caller claims it.
   */
  recordRecoveryAttempt: (documentId: string, staleProcessingBefore: Date) => Promise<boolean>;
  /**
   * Fails a stale 'processing' or enqueue-failed document whose recovery attempts are used up, with a
   * fixed message. Resolves false when the row no longer matches.
   */
  markRecoveryExhausted: (
    documentId: string,
    errorMessage: string,
    staleProcessingBefore: Date,
  ) => Promise<boolean>;
  /** Returns a document failed by an enqueue outage to 'queued' once its job is runnable again. */
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
    category?: { name: string; slug: string } | null | undefined,
  ) => Promise<void>;
  listCategories?: () => Promise<ReadonlyArray<{ name: string; slug: string }>>;
};
