import crypto from "node:crypto";
import path from "node:path";
import type { Logger } from "@axentra/observability";
import { createLogger, summarizeError } from "@axentra/observability";
import type { QueueProducer } from "@axentra/queue";
import { validateObjectKey, type StorageAdapter } from "@axentra/storage";
import {
  DOCUMENT_COPY,
  DOCUMENT_ERROR_CODES,
  type DocumentType,
  type DocumentUploadAcceptedData,
} from "@axentra/shared";
import { ConflictError } from "../../http/errors";
import type { RawUploadFile } from "./documents.schema";
import { validateUploadBatchConstraints } from "./documents.schema";
import type { CreateDocumentBatchItem, IDocumentRepository } from "./documents.repository";

export type DocumentServiceDependencies = {
  repository: IDocumentRepository;
  storage: StorageAdapter;
  queue?: QueueProducer | undefined;
  logger: Logger;
};

export type IDocumentService = {
  uploadDocuments(files: ReadonlyArray<RawUploadFile>): Promise<DocumentUploadAcceptedData>;
  validateUpload(files: ReadonlyArray<RawUploadFile>): Promise<DocumentUploadAcceptedData>;
};

function sanitizeFilename(filename: string): string {
  const base = path.basename(filename).trim();
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned : "document";
}

function createInMemoryRepository(): IDocumentRepository {
  const existingHashes = new Set<string>();
  const savedBatches: CreateDocumentBatchItem[][] = [];
  return {
    findExistingHashes: async (hashes) => {
      const found = new Set<string>();
      for (const h of hashes) {
        if (existingHashes.has(h)) found.add(h);
      }
      return found;
    },
    saveDocumentBatch: async (items) => {
      for (const item of items) {
        if (existingHashes.has(item.contentHash)) {
          throw new ConflictError(
            DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT,
            DOCUMENT_COPY.DUPLICATE_WARNING,
          );
        }
      }
      savedBatches.push([...items]);
      for (const item of items) {
        existingHashes.add(item.contentHash);
      }
      return items.map((i) => ({
        documentId: i.id,
        title: i.title,
        originalName: i.originalName,
        storageKey: i.storageKey,
        mimeType: i.mimeType,
        fileSize: i.fileSize,
        fileExtension: i.fileExtension,
        contentHash: i.contentHash,
      }));
    },
    findDocumentById: async () => null,
    findDocumentFileByDocumentId: async () => null,
  };
}

function createInMemoryStorage(): StorageAdapter {
  const map = new Map<string, Uint8Array | string>();
  return {
    initialize: async () => {},
    checkHealth: async () => {},
    putObject: async ({ key, body }) => {
      map.set(key, body);
    },
    getObject: async (key) => {
      const v = map.get(key);
      if (!v) throw new Error("Not found");
      return typeof v === "string" ? new TextEncoder().encode(v) : v;
    },
    deleteObject: async (key) => {
      map.delete(key);
    },
    headObject: async (key) => {
      const v = map.get(key);
      if (!v) throw new Error("Not found");
      return {
        key,
        contentLength: typeof v === "string" ? v.length : v.byteLength,
        contentType: undefined,
        checksumSha256: undefined,
      };
    },
    createDownloadUrl: async (key) => `http://mock-storage/${key}`,
    close: async () => {},
  };
}

export class DocumentService implements IDocumentService {
  public constructor(private readonly dependencies: DocumentServiceDependencies) {}

  public async validateUpload(
    files: ReadonlyArray<RawUploadFile>,
  ): Promise<DocumentUploadAcceptedData> {
    return await this.uploadDocuments(files);
  }

  public async uploadDocuments(
    files: ReadonlyArray<RawUploadFile>,
  ): Promise<DocumentUploadAcceptedData> {
    // 1. Strict canonical validation (PDF signature, DOCX OOXML structure, batch limits)
    const validatedFiles = validateUploadBatchConstraints(files);

    // 2. Compute SHA-256 hashes and check for intra-batch duplicates
    const hashes: Array<string> = [];
    const seenHashesInBatch = new Set<string>();

    for (const file of files) {
      const hash = crypto.createHash("sha256").update(file.bytes).digest("hex");
      if (seenHashesInBatch.has(hash)) {
        throw new ConflictError(
          DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT,
          DOCUMENT_COPY.DUPLICATE_WARNING,
        );
      }
      seenHashesInBatch.add(hash);
      hashes.push(hash);
    }

    // 3. Check against existing hashes in database
    const existingHashes = await this.dependencies.repository.findExistingHashes(hashes);
    if (existingHashes.size > 0) {
      throw new ConflictError(
        DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT,
        DOCUMENT_COPY.DUPLICATE_WARNING,
      );
    }

    // 4. Upload files to object storage with compensating rollback tracking
    const uploadedStorageKeys: Array<string> = [];
    const batchItems: Array<CreateDocumentBatchItem> = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const validated = validatedFiles[i];
        const hash = hashes[i];
        if (!file || !validated || !hash) continue;

        const documentId = crypto.randomUUID();
        const safeName = sanitizeFilename(validated.filename);
        const storageKey = validateObjectKey(`documents/${documentId}/${safeName}`);

        await this.dependencies.storage.putObject({
          key: storageKey,
          body: file.bytes,
          contentType: validated.mimeType,
          checksumSha256: hash,
        });

        uploadedStorageKeys.push(storageKey);

        batchItems.push({
          id: documentId,
          title: validated.filename,
          storageKey,
          originalName: validated.filename,
          mimeType: validated.mimeType,
          fileSize: validated.size,
          fileExtension: validated.documentType,
          contentHash: hash,
          hashAlgorithm: "sha256",
        });
      }

      // 5. Persist to database transactionally (unique constraint violation throws ConflictError)
      await this.dependencies.repository.saveDocumentBatch(batchItems);
    } catch (error) {
      // Compensating action: clean up any uploaded storage objects on failure
      if (uploadedStorageKeys.length > 0) {
        const results = await Promise.allSettled(
          uploadedStorageKeys.map((key) => this.dependencies.storage.deleteObject(key)),
        );
        for (let i = 0; i < results.length; i++) {
          const res = results[i];
          const key = uploadedStorageKeys[i];
          if (res?.status === "rejected") {
            this.dependencies.logger.error(
              { storageKey: key, error: summarizeError(res.reason) },
              "Failed to clean up orphaned storage object during rollback",
            );
          }
        }
      }
      throw error;
    }

    // 6. Enqueue background processing job for accepted documents
    if (this.dependencies.queue) {
      for (const item of batchItems) {
        try {
          await this.dependencies.queue.enqueueDocumentProcess({
            jobId: crypto.randomUUID(),
            schemaVersion: 1,
            documentId: item.id,
            storageKey: item.storageKey,
            enqueuedAt: new Date().toISOString(),
          });
        } catch (queueError) {
          this.dependencies.logger.error(
            {
              documentId: item.id,
              storageKey: item.storageKey,
              error: summarizeError(queueError),
            },
            "Failed to enqueue document processing job; document remains queued in database",
          );
        }
      }
    }

    // 7. Return success envelope data
    return {
      message: DOCUMENT_COPY.UPLOAD_ACCEPTED,
      count: batchItems.length,
      files: batchItems.map((item) => ({
        filename: item.originalName,
        size: item.fileSize,
        documentType: item.fileExtension as DocumentType,
      })),
    };
  }
}

export function createDocumentService(
  dependencies?: Partial<DocumentServiceDependencies>,
): DocumentService {
  return new DocumentService({
    repository: dependencies?.repository ?? createInMemoryRepository(),
    storage: dependencies?.storage ?? createInMemoryStorage(),
    queue: dependencies?.queue,
    logger:
      dependencies?.logger ??
      createLogger({
        service: "axentra-api",
        environment: "test",
        version: "0.1.0",
        level: "fatal",
      }),
  });
}

export { DocumentService as DefaultDocumentService };
