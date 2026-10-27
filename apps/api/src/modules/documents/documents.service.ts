import type { Logger } from "@axentra/observability";
import { createLogger } from "@axentra/observability";
import type { QueueProducer } from "@axentra/queue";
import type { StorageAdapter } from "@axentra/storage";
import {
  type AuthUser,
  type CategorySummary,
  type CheckDuplicateResponse,
  type DocumentDetail,
  type DocumentMetadataResult,
  type DocumentUploadAcceptedData,
  RELATED_DOCUMENTS_MAX_LIMIT,
  type RelatedDocument,
  type SmartTag,
} from "@axentra/shared";
import type {
  DocumentServiceDependencies,
  IDocumentService,
  RecentDocumentList,
} from "./documents.service.types";
import type { RawUploadFile } from "./documents.schema";
import type { IDocumentRepository } from "./documents.repository";
import type { IDocumentContentHashRepository } from "./duplicate.repository";
import type { IMetadataExtractor } from "./metadata.extractor";
import { DeterministicMetadataExtractor } from "./metadata.extractor";
import type { IDocumentMetadataRepository, SaveMetadataInput } from "./metadata.repository";
import { InMemoryDocumentMetadataRepository } from "./metadata.repository";
import type { IDocumentSmartTagsRepository } from "./smart-tags.repository";
import { InMemoryDocumentSmartTagsRepository } from "./smart-tags.repository";
import type { IDocumentCategoryRepository } from "./category.repository";
import { InMemoryDocumentCategoryRepository } from "./category.repository";
import { createInMemoryRepository, createInMemoryStorage } from "./documents.service.helpers";
import { NotFoundError } from "../../http/errors";
import { persistUploadedDocuments } from "./documents.upload.operations";
import { checkDuplicateOperation, type CheckDuplicateInput } from "./duplicate.operations";
import {
  extractAndStoreMetadata,
  readStoredMetadata,
  storeProvidedMetadata,
  type ExtractMetadataOptions,
} from "./documents.metadata.operations";
import { readDocumentSmartTags, storeDocumentSmartTags } from "./smart-tags.operations";
import { readDocumentCategory } from "./category.operations";
import { readDocumentDetail } from "./documents.detail.operations";
import type { IDownloadRepository } from "./download.repository";
import { InMemoryDownloadRepository } from "./download.repository";
import {
  executeDownloadOperation,
  type DownloadOperationResult,
  type ExecuteDownloadInput,
} from "./download.operations";
import {
  executeBulkDownloadOperation,
  type BulkDownloadOperationResult,
  type ExecuteBulkDownloadInput,
} from "./bulk-download.operations";
import type { BulkDownloadSemaphore } from "./bulk-download.semaphore";
import type { IPreviewRepository } from "./preview.repository";
import { InMemoryPreviewRepository } from "./preview.repository";
import {
  executePreviewOperation,
  type PreviewOperationResult,
  type ExecutePreviewInput,
} from "./preview.operations";
import {
  executePreviewContentOperation,
  type ExecutePreviewContentInput,
  type PreviewContentOperationResult,
} from "./preview-content.operations";

export type {
  BulkDownloadOperationResult,
  CheckDuplicateInput,
  DownloadOperationResult,
  ExecuteBulkDownloadInput,
  ExecuteDownloadInput,
  ExecutePreviewContentInput,
  ExecutePreviewInput,
  ExtractMetadataOptions,
  PreviewContentOperationResult,
  PreviewOperationResult,
};

export type { DocumentServiceDependencies, IDocumentService, RecentDocumentList };

export class DocumentService implements IDocumentService {
  private readonly repository: IDocumentRepository;
  private readonly storage: StorageAdapter;
  private readonly queue?: QueueProducer | undefined;
  private readonly logger: Logger;
  private readonly metadataRepository: IDocumentMetadataRepository;
  private readonly metadataExtractor: IMetadataExtractor;
  private readonly queueProducer?: QueueProducer | undefined;
  private readonly contentHashRepository?: IDocumentContentHashRepository | undefined;
  private readonly smartTagsRepository: IDocumentSmartTagsRepository;
  private readonly categoryRepository: IDocumentCategoryRepository;
  private readonly downloadRepository: IDownloadRepository;
  private readonly previewRepository: IPreviewRepository;
  private readonly bulkDownloadSemaphore?: BulkDownloadSemaphore | undefined;

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
    this.smartTagsRepository =
      dependencies.smartTagsRepository ?? new InMemoryDocumentSmartTagsRepository();
    this.categoryRepository =
      dependencies.categoryRepository ?? new InMemoryDocumentCategoryRepository();
    this.downloadRepository = dependencies.downloadRepository ?? new InMemoryDownloadRepository();
    this.previewRepository = dependencies.previewRepository ?? new InMemoryPreviewRepository();
    this.bulkDownloadSemaphore = dependencies.bulkDownloadSemaphore;
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
        contentHashRepository: this.contentHashRepository,
      },
      files,
    );
  }

  public async checkDuplicate(input: CheckDuplicateInput): Promise<CheckDuplicateResponse> {
    return checkDuplicateOperation(
      {
        repository: this.repository,
        contentHashRepository: this.contentHashRepository,
      },
      input,
    );
  }

  public async listRecentDocuments(
    page: number,
    limit: number,
    tags?: ReadonlyArray<string> | undefined,
  ): Promise<RecentDocumentList> {
    return await this.repository.listRecentDocuments(page, limit, tags);
  }

  public async listRelatedDocuments(documentId: string): Promise<ReadonlyArray<RelatedDocument>> {
    const document = await this.repository.findDocumentById(documentId);
    if (!document || document.deletedAt) {
      throw new NotFoundError("Dokumen tidak ditemukan");
    }

    return await this.repository.listRelatedDocuments(documentId, RELATED_DOCUMENTS_MAX_LIMIT);
  }

  public async getDocumentMetadata(documentId: string): Promise<DocumentMetadataResult> {
    return readStoredMetadata(this.metadataRepository, documentId);
  }

  public async getDocumentSmartTags(documentId: string): Promise<ReadonlyArray<SmartTag>> {
    return readDocumentSmartTags(this.smartTagsRepository, documentId);
  }

  public async getDocumentCategory(documentId: string): Promise<CategorySummary | null> {
    return readDocumentCategory(this.categoryRepository, documentId);
  }

  public async getDocumentDetail(
    documentId: string,
    role: AuthUser["role"],
  ): Promise<DocumentDetail> {
    return readDocumentDetail(
      {
        repository: this.repository,
        metadataRepository: this.metadataRepository,
        smartTagsRepository: this.smartTagsRepository,
        categoryRepository: this.categoryRepository,
      },
      documentId,
      role,
    );
  }

  public async storeSmartTags(
    documentId: string,
    tags: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<SmartTag>> {
    return storeDocumentSmartTags(this.smartTagsRepository, documentId, tags);
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
    // Job id = document id, the same id the upload path uses, so BullMQ never holds two jobs for one document.
    return producer.enqueueDocumentProcessing({
      jobId: documentId,
      documentId,
      schemaVersion: 1,
      requestedAt: new Date().toISOString(),
    });
  }

  public async downloadDocument(input: ExecuteDownloadInput): Promise<DownloadOperationResult> {
    return executeDownloadOperation(
      {
        downloadRepository: this.downloadRepository,
        storage: this.storage,
        logger: this.logger,
      },
      input,
    );
  }

  public async bulkDownloadDocuments(
    input: ExecuteBulkDownloadInput,
  ): Promise<BulkDownloadOperationResult> {
    return executeBulkDownloadOperation(
      {
        downloadRepository: this.downloadRepository,
        storage: this.storage,
        logger: this.logger,
        bulkDownloadSemaphore: this.bulkDownloadSemaphore,
      },
      input,
    );
  }

  public async previewDocument(input: ExecutePreviewInput): Promise<PreviewOperationResult> {
    return executePreviewOperation(
      {
        previewRepository: this.previewRepository,
      },
      input,
    );
  }

  public async previewDocumentContent(
    input: ExecutePreviewContentInput,
  ): Promise<PreviewContentOperationResult> {
    return executePreviewContentOperation(
      {
        previewRepository: this.previewRepository,
        storage: this.storage,
        logger: this.logger,
      },
      input,
    );
  }
}

export function createDocumentService(
  dependencies: DocumentServiceDependencies = {},
): DocumentService {
  return new DocumentService(dependencies);
}

export { DocumentService as DefaultDocumentService };
