import type { Logger } from "@axentra/observability";
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
import type { IDocumentDetailRepository } from "./documents.detail.repository";
import type { IDocumentContentHashRepository } from "./duplicate.repository";
import type { IMetadataExtractor } from "./metadata.extractor";
import { DeterministicMetadataExtractor } from "./metadata.extractor";
import type { IDocumentMetadataRepository, SaveMetadataInput } from "./metadata.repository";
import { InMemoryDocumentMetadataRepository } from "./metadata.repository";
import type { IDocumentSmartTagsRepository } from "./smart-tags.repository";
import { InMemoryDocumentSmartTagsRepository } from "./smart-tags.repository";
import type { IDocumentCategoryRepository } from "./category.repository";
import { InMemoryDocumentCategoryRepository } from "./category.repository";
import {
  createDefaultServiceLogger,
  createInMemoryDocumentStore,
  createInMemoryStorage,
} from "./documents.service.helpers";
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
import { DocumentFileAccessService } from "./documents.file-access.service";
import { InMemoryDownloadRepository } from "./download.repository";
import { InMemoryPreviewRepository } from "./preview.repository";
import type { DownloadOperationResult, ExecuteDownloadInput } from "./download.operations";
import type {
  BulkDownloadOperationResult,
  ExecuteBulkDownloadInput,
} from "./bulk-download.operations";
import type { ExecutePreviewInput, PreviewOperationResult } from "./preview.operations";
import type {
  ExecutePreviewContentInput,
  PreviewContentOperationResult,
} from "./preview-content.operations";

export type { CheckDuplicateInput, ExtractMetadataOptions };
export type { DocumentServiceDependencies, IDocumentService, RecentDocumentList };

export class DocumentService implements IDocumentService {
  private readonly repository: IDocumentRepository;
  private readonly detailRepository: IDocumentDetailRepository;
  private readonly storage: StorageAdapter;
  private readonly queue?: QueueProducer | undefined;
  private readonly logger: Logger;
  private readonly metadataRepository: IDocumentMetadataRepository;
  private readonly metadataExtractor: IMetadataExtractor;
  private readonly queueProducer?: QueueProducer | undefined;
  private readonly contentHashRepository?: IDocumentContentHashRepository | undefined;
  private readonly smartTagsRepository: IDocumentSmartTagsRepository;
  private readonly categoryRepository: IDocumentCategoryRepository;
  private readonly fileAccess: DocumentFileAccessService;

  public constructor(dependencies: DocumentServiceDependencies = {}) {
    const inMemory = createInMemoryDocumentStore();
    this.repository = dependencies.repository ?? inMemory.repository;
    this.detailRepository = dependencies.detailRepository ?? inMemory.detailRepository;
    this.storage = dependencies.storage ?? createInMemoryStorage();
    this.queue = dependencies.queue ?? dependencies.queueProducer;
    this.queueProducer = dependencies.queueProducer ?? dependencies.queue;
    this.logger = dependencies.logger ?? createDefaultServiceLogger();
    this.metadataRepository =
      dependencies.metadataRepository ?? new InMemoryDocumentMetadataRepository();
    this.metadataExtractor = dependencies.metadataExtractor ?? new DeterministicMetadataExtractor();
    this.contentHashRepository = dependencies.contentHashRepository;
    this.smartTagsRepository =
      dependencies.smartTagsRepository ?? new InMemoryDocumentSmartTagsRepository();
    this.categoryRepository =
      dependencies.categoryRepository ?? new InMemoryDocumentCategoryRepository();
    this.fileAccess = new DocumentFileAccessService({
      downloadRepository: dependencies.downloadRepository ?? new InMemoryDownloadRepository(),
      previewRepository: dependencies.previewRepository ?? new InMemoryPreviewRepository(),
      storage: this.storage,
      logger: this.logger,
      bulkDownloadSemaphore: dependencies.bulkDownloadSemaphore,
      bulkDownloadByteBudget: dependencies.bulkDownloadByteBudget,
      bulkDownloadTransferTimeoutMs: dependencies.bulkDownloadTransferTimeoutMs,
      storageTimeoutMs: dependencies.storageTimeoutMs,
    });
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
        repository: this.detailRepository,
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
    return this.fileAccess.downloadDocument(input);
  }

  public async bulkDownloadDocuments(
    input: ExecuteBulkDownloadInput,
  ): Promise<BulkDownloadOperationResult> {
    return this.fileAccess.bulkDownloadDocuments(input);
  }

  public async previewDocument(input: ExecutePreviewInput): Promise<PreviewOperationResult> {
    return this.fileAccess.previewDocument(input);
  }

  public async previewDocumentContent(
    input: ExecutePreviewContentInput,
  ): Promise<PreviewContentOperationResult> {
    return this.fileAccess.previewDocumentContent(input);
  }
}

export function createDocumentService(
  dependencies: DocumentServiceDependencies = {},
): DocumentService {
  return new DocumentService(dependencies);
}

export { DocumentService as DefaultDocumentService };
