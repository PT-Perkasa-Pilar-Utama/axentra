import type { Logger } from "@axentra/observability";
import type { QueueProducer } from "@axentra/queue";
import type { StorageAdapter } from "@axentra/storage";
import type {
  AuthUser,
  CategorySummary,
  CheckDuplicateResponse,
  DocumentDetail,
  DocumentMetadataResult,
  DocumentUploadAcceptedData,
  PaginationMeta,
  RecentDocument,
  RelatedDocument,
  SmartTag,
} from "@axentra/shared";
import type { RawUploadFile } from "./documents.schema";
import type { IDocumentRepository } from "./documents.repository";
import type { IDocumentDetailRepository } from "./documents.detail.repository";
import type { IDocumentContentHashRepository } from "./duplicate.repository";
import type { CheckDuplicateInput } from "./duplicate.operations";
import type { IMetadataExtractor } from "./metadata.extractor";
import type { IDocumentMetadataRepository, SaveMetadataInput } from "./metadata.repository";
import type { IDocumentSmartTagsRepository } from "./smart-tags.repository";
import type { IDocumentCategoryRepository } from "./category.repository";
import type { ExtractMetadataOptions } from "./documents.metadata.operations";
import type { IDownloadRepository } from "./download.repository";
import type { DownloadOperationResult, ExecuteDownloadInput } from "./download.operations";
import type {
  BulkDownloadOperationResult,
  ExecuteBulkDownloadInput,
} from "./bulk-download.operations";
import type { BulkDownloadSemaphore } from "./bulk-download.semaphore";
import type { BulkDownloadByteBudget } from "./bulk-download.byte-budget";
import type { IPreviewRepository } from "./preview.repository";
import type { ExecutePreviewInput, PreviewOperationResult } from "./preview.operations";
import type {
  ExecutePreviewContentInput,
  PreviewContentOperationResult,
} from "./preview-content.operations";

export type DocumentServiceDependencies = {
  repository?: IDocumentRepository | undefined;
  storage?: StorageAdapter | undefined;
  queue?: QueueProducer | undefined;
  logger?: Logger | undefined;
  metadataRepository?: IDocumentMetadataRepository | undefined;
  metadataExtractor?: IMetadataExtractor | undefined;
  queueProducer?: QueueProducer | undefined;
  contentHashRepository?: IDocumentContentHashRepository | undefined;
  smartTagsRepository?: IDocumentSmartTagsRepository | undefined;
  categoryRepository?: IDocumentCategoryRepository | undefined;
  downloadRepository?: IDownloadRepository | undefined;
  previewRepository?: IPreviewRepository | undefined;
  detailRepository?: IDocumentDetailRepository | undefined;
  bulkDownloadSemaphore?: BulkDownloadSemaphore | undefined;
  bulkDownloadByteBudget?: BulkDownloadByteBudget | undefined;
  bulkDownloadTransferTimeoutMs?: number | undefined;
  storageTimeoutMs?: number | undefined;
};

export type RecentDocumentList = {
  items: ReadonlyArray<RecentDocument>;
  meta: PaginationMeta;
};

export type IDocumentService = {
  uploadDocuments(files: ReadonlyArray<RawUploadFile>): Promise<DocumentUploadAcceptedData>;
  validateUpload(files: ReadonlyArray<RawUploadFile>): Promise<DocumentUploadAcceptedData>;
  checkDuplicate(input: CheckDuplicateInput): Promise<CheckDuplicateResponse>;
  listRecentDocuments(
    page: number,
    limit: number,
    tags?: ReadonlyArray<string> | undefined,
  ): Promise<RecentDocumentList>;
  listRelatedDocuments(documentId: string): Promise<ReadonlyArray<RelatedDocument>>;
  getDocumentMetadata(documentId: string): Promise<DocumentMetadataResult>;
  getDocumentSmartTags(documentId: string): Promise<ReadonlyArray<SmartTag>>;
  getDocumentCategory(documentId: string): Promise<CategorySummary | null>;
  getDocumentDetail(documentId: string, role: AuthUser["role"]): Promise<DocumentDetail>;
  storeSmartTags(documentId: string, tags: ReadonlyArray<string>): Promise<ReadonlyArray<SmartTag>>;
  extractAndStoreMetadata(
    documentId: string,
    options?: ExtractMetadataOptions | undefined,
  ): Promise<DocumentMetadataResult>;
  storeMetadata(data: SaveMetadataInput): Promise<DocumentMetadataResult>;
  enqueueProcessingJob(documentId: string): Promise<string>;
  downloadDocument(input: ExecuteDownloadInput): Promise<DownloadOperationResult>;
  bulkDownloadDocuments(input: ExecuteBulkDownloadInput): Promise<BulkDownloadOperationResult>;
  previewDocument(input: ExecutePreviewInput): Promise<PreviewOperationResult>;
  previewDocumentContent(input: ExecutePreviewContentInput): Promise<PreviewContentOperationResult>;
};
