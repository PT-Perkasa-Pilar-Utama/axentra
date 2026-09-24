import crypto from "node:crypto";
import type { Logger } from "@axentra/observability";
import { createLogger } from "@axentra/observability";
import type { QueueProducer } from "@axentra/queue";
import type { StorageAdapter } from "@axentra/storage";
import {
  type DocumentMetadataResult,
  type DocumentUploadAcceptedData,
  type PaginationMeta,
  type RecentDocument,
} from "@axentra/shared";
import type { RawUploadFile } from "./documents.schema";
import type { IDocumentRepository } from "./documents.repository";
import type { IMetadataExtractor } from "./metadata.extractor";
import { DeterministicMetadataExtractor } from "./metadata.extractor";
import type { IDocumentMetadataRepository, SaveMetadataInput } from "./metadata.repository";
import { InMemoryDocumentMetadataRepository } from "./metadata.repository";
import { createInMemoryRepository, createInMemoryStorage } from "./documents.service.helpers";
import { persistUploadedDocuments } from "./documents.upload.operations";
import {
  extractAndStoreMetadata,
  readStoredMetadata,
  storeProvidedMetadata,
  type ExtractMetadataOptions,
} from "./documents.metadata.operations";

export type { ExtractMetadataOptions };

export type DocumentServiceDependencies = {
  repository?: IDocumentRepository | undefined;
  storage?: StorageAdapter | undefined;
  queue?: QueueProducer | undefined;
  logger?: Logger | undefined;
  metadataRepository?: IDocumentMetadataRepository | undefined;
  metadataExtractor?: IMetadataExtractor | undefined;
  queueProducer?: QueueProducer | undefined;
};

export type RecentDocumentList = {
  items: ReadonlyArray<RecentDocument>;
  meta: PaginationMeta;
};

export type IDocumentService = {
  uploadDocuments(files: ReadonlyArray<RawUploadFile>): Promise<DocumentUploadAcceptedData>;
  validateUpload(files: ReadonlyArray<RawUploadFile>): Promise<DocumentUploadAcceptedData>;
  listRecentDocuments(page: number, limit: number): Promise<RecentDocumentList>;
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
  }

  public async validateUpload(
    files: ReadonlyArray<RawUploadFile>,
  ): Promise<DocumentUploadAcceptedData> {
    return await this.uploadDocuments(files);
  }

  public async uploadDocuments(
    files: ReadonlyArray<RawUploadFile>,
  ): Promise<DocumentUploadAcceptedData> {
    return persistUploadedDocuments(
      {
        repository: this.repository,
        storage: this.storage,
        logger: this.logger,
        queue: this.queue,
        queueProducer: this.queueProducer,
      },
      files,
    );
  }

  public async listRecentDocuments(page: number, limit: number): Promise<RecentDocumentList> {
    return await this.repository.listRecentDocuments(page, limit);
  }

  public async getDocumentMetadata(documentId: string): Promise<DocumentMetadataResult> {
    return readStoredMetadata(this.metadataRepository, documentId);
  }

  public async extractAndStoreMetadata(
    documentId: string,
    options?: ExtractMetadataOptions | undefined,
  ): Promise<DocumentMetadataResult> {
    return extractAndStoreMetadata(
      this.metadataRepository,
      this.metadataExtractor,
      documentId,
      options,
    );
  }

  public async storeMetadata(data: SaveMetadataInput): Promise<DocumentMetadataResult> {
    return storeProvidedMetadata(this.metadataRepository, data);
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
