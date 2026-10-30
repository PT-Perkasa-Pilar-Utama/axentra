import type { documentFiles, documents } from "@axentra/db";
import type { PaginationMeta, RecentDocument, RelatedDocument } from "@axentra/shared";

export type CreateDocumentBatchItem = {
  id: string;
  title: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  fileExtension: string;
  contentHash: string;
  hashAlgorithm?: string;
};

export type SavedDocumentRecord = Omit<CreateDocumentBatchItem, "id" | "hashAlgorithm"> & {
  documentId: string;
};

export type RecentDocumentPage = {
  items: ReadonlyArray<RecentDocument>;
  meta: PaginationMeta;
};

// The detail read (document joined to its file) lives in IDocumentDetailRepository, which is injected
// into the service separately (documents.detail.repository.ts).
export type IDocumentRepository = {
  findExistingHashes: (hashes: ReadonlyArray<string>, algorithm?: string) => Promise<Set<string>>;
  findByContentHash?: (
    contentHash: string,
    algorithm?: string,
  ) => Promise<{ documentId: string; contentHash: string } | null>;
  listRecentDocuments: (
    page: number,
    limit: number,
    tags?: ReadonlyArray<string> | undefined,
  ) => Promise<RecentDocumentPage>;
  listRelatedDocuments: (
    documentId: string,
    limit: number,
  ) => Promise<ReadonlyArray<RelatedDocument>>;
  saveDocumentBatch: (
    items: ReadonlyArray<CreateDocumentBatchItem>,
  ) => Promise<ReadonlyArray<SavedDocumentRecord>>;
  findDocumentById: (id: string) => Promise<typeof documents.$inferSelect | null>;
  findDocumentFileByDocumentId: (
    documentId: string,
  ) => Promise<typeof documentFiles.$inferSelect | null>;
  markProcessingEnqueueFailed: (
    documentIds: ReadonlyArray<string>,
    errorMessage: string,
  ) => Promise<void>;
};

export type DocumentBatchTx = {
  select: (fields: unknown) => {
    from: (table: unknown) => {
      where: (condition: unknown) => Promise<ReadonlyArray<{ contentHash: string }>>;
    };
  };
  insert: (table: unknown) => { values: (values: unknown) => Promise<unknown> };
};

export type DocumentBatchDb = {
  transaction: <T>(callback: (tx: DocumentBatchTx) => Promise<T>) => Promise<T>;
};
