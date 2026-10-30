import type { Logger } from "@axentra/observability";
import type { StorageAdapter } from "@axentra/storage";
import {
  type BulkDownloadOperationResult,
  executeBulkDownloadOperation,
  type ExecuteBulkDownloadInput,
} from "./bulk-download.operations";
import type { BulkDownloadByteBudget } from "./bulk-download.byte-budget";
import type { BulkDownloadSemaphore } from "./bulk-download.semaphore";
import {
  type DownloadOperationResult,
  executeDownloadOperation,
  type ExecuteDownloadInput,
} from "./download.operations";
import type { IDownloadRepository } from "./download.repository";
import {
  executePreviewOperation,
  type ExecutePreviewInput,
  type PreviewOperationResult,
} from "./preview.operations";
import type { IPreviewRepository } from "./preview.repository";
import {
  executePreviewContentOperation,
  type ExecutePreviewContentInput,
  type PreviewContentOperationResult,
} from "./preview-content.operations";

export type DocumentFileAccessDependencies = {
  downloadRepository: IDownloadRepository;
  previewRepository: IPreviewRepository;
  storage: StorageAdapter;
  logger: Logger;
  bulkDownloadSemaphore?: BulkDownloadSemaphore | undefined;
  bulkDownloadByteBudget?: BulkDownloadByteBudget | undefined;
  bulkDownloadTransferTimeoutMs?: number | undefined;
  storageTimeoutMs?: number | undefined;
};

// File-facing reads (single and bulk download, preview) kept apart from DocumentService. Each call runs
// the operation that owns its permission, limit, and audit rules.
export class DocumentFileAccessService {
  public constructor(private readonly dependencies: DocumentFileAccessDependencies) {}

  public async downloadDocument(input: ExecuteDownloadInput): Promise<DownloadOperationResult> {
    return executeDownloadOperation(
      {
        downloadRepository: this.dependencies.downloadRepository,
        storage: this.dependencies.storage,
        logger: this.dependencies.logger,
      },
      input,
    );
  }

  public async bulkDownloadDocuments(
    input: ExecuteBulkDownloadInput,
  ): Promise<BulkDownloadOperationResult> {
    return executeBulkDownloadOperation(
      {
        downloadRepository: this.dependencies.downloadRepository,
        storage: this.dependencies.storage,
        logger: this.dependencies.logger,
        bulkDownloadSemaphore: this.dependencies.bulkDownloadSemaphore,
        bulkDownloadByteBudget: this.dependencies.bulkDownloadByteBudget,
        bulkDownloadTransferTimeoutMs: this.dependencies.bulkDownloadTransferTimeoutMs,
        storageTimeoutMs: this.dependencies.storageTimeoutMs,
      },
      input,
    );
  }

  public async previewDocument(input: ExecutePreviewInput): Promise<PreviewOperationResult> {
    return executePreviewOperation(
      { previewRepository: this.dependencies.previewRepository },
      input,
    );
  }

  public async previewDocumentContent(
    input: ExecutePreviewContentInput,
  ): Promise<PreviewContentOperationResult> {
    return executePreviewContentOperation(
      {
        previewRepository: this.dependencies.previewRepository,
        storage: this.dependencies.storage,
        logger: this.dependencies.logger,
      },
      input,
    );
  }
}
