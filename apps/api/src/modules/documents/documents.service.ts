import crypto from "node:crypto";
import type { Logger } from "@axentra/observability";
import { createLogger, summarizeError } from "@axentra/observability";
import type { QueueProducer } from "@axentra/queue";
import { validateObjectKey, type StorageAdapter } from "@axentra/storage";
import {
  DOCUMENT_COPY,
  DOCUMENT_ERROR_CODES,
  type CheckDuplicateResponse,
  type DocumentMetadataResult,
  type DocumentType,
  type DocumentUploadAcceptedData,
} from "@axentra/shared";
import { ConflictError, NotFoundError, ValidationError } from "../../http/errors";
import type { RawUploadFile } from "./documents.schema";
import { validateUploadBatchConstraints } from "./documents.schema";
import type { CreateDocumentBatchItem, IDocumentRepository } from "./documents.repository";
import type { IDocumentContentHashRepository } from "./duplicate.repository";
import type { IMetadataExtractor } from "./metadata.extractor";
import { DeterministicMetadataExtractor } from "./metadata.extractor";
import type { IDocumentMetadataRepository, SaveMetadataInput } from "./metadata.repository";
import { InMemoryDocumentMetadataRepository } from "./metadata.repository";
import {
  createInMemoryRepository,
  createInMemoryStorage,
  formatMetadataResult,
  sanitizeFilename,
} from "./documents.service.helpers";

export type ExtractMetadataOptions = {
  filename?: string | undefined;
  mimeType?: string | undefined;
  buffer?: Uint8Array | Buffer | undefined;
  rawText?: string | undefined;
};

export type CheckDuplicateInput = {
  contentHash?: string | undefined;
  buffer?: Uint8Array | undefined;
  algorithm?: string | undefined;
};

export type DocumentServiceDependencies = {
  repository?: IDocumentRepository | undefined;
  storage?: StorageAdapter | undefined;
  queue?: QueueProducer | undefined;
  logger?: Logger | undefined;
  metadataRepository?: IDocumentMetadataRepository | undefined;
  metadataExtractor?: IMetadataExtractor | undefined;
  queueProducer?: QueueProducer | undefined;
  contentHashRepository?: IDocumentContentHashRepository | undefined;
};

export type IDocumentService = {
  uploadDocuments(files: ReadonlyArray<RawUploadFile>): Promise<DocumentUploadAcceptedData>;
  validateUpload(files: ReadonlyArray<RawUploadFile>): Promise<DocumentUploadAcceptedData>;
  checkDuplicate(input: CheckDuplicateInput): Promise<CheckDuplicateResponse>;
  getDocumentMetadata(documentId: string): Promise<DocumentMetadataResult>;
  extractAndStoreMetadata(
    documentId: string,
    options?: ExtractMetadataOptions | undefined,
  ): Promise<DocumentMetadataResult>;
  storeMetadata(data: SaveMetadataInput): Promise<DocumentMetadataResult>;
  enqueueProcessingJob(documentId: string): Promise<string>;
};

export class DocumentService implements IDocumentService {
  private readonly repository: IDocumentRepository;
  private readonly storage: StorageAdapter;
  private readonly queue?: QueueProducer | undefined;
  private readonly logger: Logger;
  private readonly metadataRepository: IDocumentMetadataRepository;
  private readonly metadataExtractor: IMetadataExtractor;
  private readonly queueProducer?: QueueProducer | undefined;
  private readonly contentHashRepository?: IDocumentContentHashRepository | undefined;

  public constructor(dependencies: DocumentServiceDependencies = {}) {
    this.repository = dependencies.repository ?? createInMemoryRepository();
    this.storage = dependencies.storage ?? createInMemoryStorage();
    this.queue = dependencies.queue ?? dependencies.queueProducer;
    this.queueProducer = dependencies.queueProducer ?? dependencies.queue;
    this.logger =
      dependencies.logger ??
      createLogger({
        service: "axentra-api",
        environment: "test",
        version: "0.1.0",
        level: "fatal",
      });
    this.metadataRepository =
      dependencies.metadataRepository ?? new InMemoryDocumentMetadataRepository();
    this.metadataExtractor = dependencies.metadataExtractor ?? new DeterministicMetadataExtractor();
    this.contentHashRepository = dependencies.contentHashRepository;
  }

  public async validateUpload(
    files: ReadonlyArray<RawUploadFile>,
  ): Promise<DocumentUploadAcceptedData> {
    return await this.uploadDocuments(files);
  }

  public async uploadDocuments(
    files: ReadonlyArray<RawUploadFile>,
  ): Promise<DocumentUploadAcceptedData> {
    const validatedFiles = validateUploadBatchConstraints(files);

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

    const existingHashes = this.contentHashRepository
      ? await this.contentHashRepository.findExistingHashes(hashes)
      : await this.repository.findExistingHashes(hashes);
    if (existingHashes.size > 0) {
      throw new ConflictError(
        DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT,
        DOCUMENT_COPY.DUPLICATE_WARNING,
      );
    }

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

        await this.storage.putObject({
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

      await this.repository.saveDocumentBatch(batchItems);
      if (this.contentHashRepository) {
        for (const item of batchItems) {
          try {
            await this.contentHashRepository.saveContentHash({
              documentId: item.id,
              contentHash: item.contentHash,
              hashAlgorithm: item.hashAlgorithm,
            });
          } catch {
            // Hash may already be saved by DocumentRepository
          }
        }
      }
    } catch (error) {
      if (uploadedStorageKeys.length > 0) {
        const results = await Promise.allSettled(
          uploadedStorageKeys.map((key) => this.storage.deleteObject(key)),
        );
        for (let i = 0; i < results.length; i++) {
          const res = results[i];
          const key = uploadedStorageKeys[i];
          if (res?.status === "rejected") {
            this.logger.error(
              { storageKey: key, error: summarizeError(res.reason) },
              "Failed to clean up orphaned storage object during rollback",
            );
          }
        }
      }
      throw error;
    }

    const producer = this.queue ?? this.queueProducer;
    if (producer) {
      for (const item of batchItems) {
        try {
          await producer.enqueueDocumentProcessing({
            jobId: crypto.randomUUID(),
            documentId: item.id,
            schemaVersion: 1,
            requestedAt: new Date().toISOString(),
            storageKey: item.storageKey,
            enqueuedAt: new Date().toISOString(),
          });
        } catch (queueError) {
          this.logger.error(
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

  public async checkDuplicate(input: CheckDuplicateInput): Promise<CheckDuplicateResponse> {
    let hash = input.contentHash;
    if (!hash && input.buffer) {
      hash = crypto.createHash("sha256").update(input.buffer).digest("hex");
    }

    if (!hash) {
      throw new ValidationError("Content hash atau file diperlukan");
    }

    const existing = this.contentHashRepository
      ? await this.contentHashRepository.findByContentHash(hash, input.algorithm)
      : await this.repository.findByContentHash?.(hash, input.algorithm);

    if (existing) {
      return {
        isDuplicate: true,
        existingDocumentId: existing.documentId,
        message: DOCUMENT_COPY.DUPLICATE_WARNING,
      };
    }

    return {
      isDuplicate: false,
    };
  }

  public async getDocumentMetadata(documentId: string): Promise<DocumentMetadataResult> {
    const document = await this.metadataRepository.findDocumentById(documentId);
    if (!document) {
      throw new NotFoundError("Dokumen tidak ditemukan");
    }

    const metadata = await this.metadataRepository.findMetadataByDocumentId(documentId);
    if (!metadata) {
      throw new NotFoundError("Metadata dokumen tidak ditemukan");
    }

    return formatMetadataResult(metadata);
  }

  public async extractAndStoreMetadata(
    documentId: string,
    options?: ExtractMetadataOptions | undefined,
  ): Promise<DocumentMetadataResult> {
    const document = await this.metadataRepository.findDocumentById(documentId);
    if (!document) {
      throw new NotFoundError("Dokumen tidak ditemukan");
    }

    const extracted = await this.metadataExtractor.extract({
      documentId,
      filename: options?.filename ?? document.title,
      mimeType: options?.mimeType,
      buffer: options?.buffer,
      rawText: options?.rawText,
    });

    const saved = await this.metadataRepository.saveMetadata({
      documentId,
      author: extracted.author,
      rawMetadata: extracted.rawMetadata,
      extractedAt: extracted.extractedAt,
    });

    return formatMetadataResult(saved);
  }

  public async storeMetadata(data: SaveMetadataInput): Promise<DocumentMetadataResult> {
    const document = await this.metadataRepository.findDocumentById(data.documentId);
    if (!document) {
      throw new NotFoundError("Dokumen tidak ditemukan");
    }

    const saved = await this.metadataRepository.saveMetadata(data);
    return formatMetadataResult(saved);
  }

  public async enqueueProcessingJob(documentId: string): Promise<string> {
    const producer = this.queueProducer ?? this.queue;
    if (!producer) {
      throw new Error("QueueProducer tidak tersedia untuk memproses dokumen");
    }
    return producer.enqueueDocumentProcessing({
      jobId: crypto.randomUUID(),
      documentId,
      schemaVersion: 1,
      requestedAt: new Date().toISOString(),
    });
  }
}

export function createDocumentService(
  dependencies: DocumentServiceDependencies = {},
): DocumentService {
  return new DocumentService(dependencies);
}

export { DocumentService as DefaultDocumentService };
