import crypto from "node:crypto";
import type { Logger } from "@axentra/observability";
import { summarizeError } from "@axentra/observability";
import type { QueueProducer } from "@axentra/queue";
import { validateObjectKey, type StorageAdapter } from "@axentra/storage";
import {
  DOCUMENT_COPY,
  DOCUMENT_ERROR_CODES,
  PROCESSING_ENQUEUE_FAILURE_MESSAGE,
  type DocumentType,
  type DocumentUploadAcceptedData,
  type ErrorDetail,
} from "@axentra/shared";
import { ConflictError, DependencyUnavailableError } from "../../http/errors";
import type { RawUploadFile } from "./documents.schema";
import { validateUploadBatchConstraints } from "./documents.schema";
import type { CreateDocumentBatchItem, IDocumentRepository } from "./documents.repository";
import type { IDocumentContentHashRepository } from "./duplicate.repository";
import { sanitizeFilename } from "./documents.service.helpers";

export type UploadOperationDependencies = {
  repository: IDocumentRepository;
  storage: StorageAdapter;
  logger: Logger;
  queue?: QueueProducer | undefined;
  queueProducer?: QueueProducer | undefined;
  contentHashRepository?: IDocumentContentHashRepository | undefined;
};

export async function persistUploadedDocuments(
  dependencies: UploadOperationDependencies,
  files: ReadonlyArray<RawUploadFile>,
): Promise<DocumentUploadAcceptedData> {
  const validatedFiles = validateUploadBatchConstraints(files);
  const hashes = contentHashes(files);
  const existingHashes = new Set<string>();
  if (dependencies.contentHashRepository) {
    const fromHashRepo = await dependencies.contentHashRepository.findExistingHashes(hashes);
    for (const h of fromHashRepo) existingHashes.add(h);
  }
  const fromRepo = await dependencies.repository.findExistingHashes(hashes);
  for (const h of fromRepo) existingHashes.add(h);

  if (existingHashes.size > 0) {
    throw new ConflictError(
      DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT,
      DOCUMENT_COPY.DUPLICATE_WARNING,
    );
  }

  const uploadedStorageKeys: Array<string> = [];
  const batchItems: Array<CreateDocumentBatchItem> = [];

  try {
    for (let index = 0; index < files.length; index += 1) {
      const stored = await storeUploadItem(
        dependencies,
        files[index],
        validatedFiles[index],
        hashes[index],
      );
      if (stored === undefined) continue;
      uploadedStorageKeys.push(stored.storageKey);
      batchItems.push(stored.item);
    }
    await dependencies.repository.saveDocumentBatch(batchItems);
  } catch (error) {
    await deleteStoredObjects(dependencies, uploadedStorageKeys);
    throw error;
  }

  await enqueueAcceptedDocuments(dependencies, batchItems);
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

function contentHashes(files: ReadonlyArray<RawUploadFile>): string[] {
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
  return hashes;
}

async function storeUploadItem(
  dependencies: UploadOperationDependencies,
  file: RawUploadFile | undefined,
  validated: ReturnType<typeof validateUploadBatchConstraints>[number] | undefined,
  hash: string | undefined,
): Promise<{ storageKey: string; item: CreateDocumentBatchItem } | undefined> {
  if (!file || !validated || !hash) return undefined;
  const documentId = crypto.randomUUID();
  const storageKey = validateObjectKey(
    `documents/${documentId}/${sanitizeFilename(validated.filename)}`,
  );
  await dependencies.storage.putObject({
    key: storageKey,
    body: file.bytes,
    contentType: validated.mimeType,
    checksumSha256: hash,
  });
  return {
    storageKey,
    item: {
      id: documentId,
      title: validated.filename,
      storageKey,
      originalName: validated.filename,
      mimeType: validated.mimeType,
      fileSize: validated.size,
      fileExtension: validated.documentType,
      contentHash: hash,
      hashAlgorithm: "sha256",
    },
  };
}

async function deleteStoredObjects(
  dependencies: UploadOperationDependencies,
  storageKeys: ReadonlyArray<string>,
): Promise<void> {
  if (storageKeys.length === 0) return;
  const results = await Promise.allSettled(
    storageKeys.map((key) => dependencies.storage.deleteObject(key)),
  );
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const key = storageKeys[index];
    if (result?.status === "rejected") {
      dependencies.logger.error(
        { storageKey: key, error: summarizeError(result.reason) },
        "Failed to clean up orphaned storage object during rollback",
      );
    }
  }
}

async function enqueueAcceptedDocuments(
  dependencies: UploadOperationDependencies,
  batchItems: ReadonlyArray<CreateDocumentBatchItem>,
): Promise<void> {
  const producer = dependencies.queue ?? dependencies.queueProducer;
  if (!producer) {
    await recordEnqueueFailure(dependencies, batchItems);
    throw processingUnavailable(batchItems, 0);
  }

  const acceptedAt = new Date().toISOString();
  for (const [index, item] of batchItems.entries()) {
    try {
      await producer.enqueueDocumentProcessing({
        jobId: item.id,
        documentId: item.id,
        schemaVersion: 1,
        requestedAt: acceptedAt,
        storageKey: item.storageKey,
        enqueuedAt: acceptedAt,
      });
    } catch (queueError) {
      const pending = batchItems.slice(index);
      await recordEnqueueFailure(dependencies, pending, queueError);
      throw processingUnavailable(batchItems, index);
    }
  }
}

function processingUnavailable(
  batchItems: ReadonlyArray<CreateDocumentBatchItem>,
  failedFromIndex: number,
): DependencyUnavailableError {
  const details: ErrorDetail[] = batchItems.map((item, index) => ({
    field: item.id,
    message: `${index < failedFromIndex ? "queued" : "failed"} ${item.originalName}`,
  }));
  return new DependencyUnavailableError(
    DOCUMENT_ERROR_CODES.PROCESSING_UNAVAILABLE,
    PROCESSING_ENQUEUE_FAILURE_MESSAGE,
    details,
  );
}

async function recordEnqueueFailure(
  dependencies: UploadOperationDependencies,
  pendingItems: ReadonlyArray<CreateDocumentBatchItem>,
  queueError?: unknown,
): Promise<void> {
  const documentIds = pendingItems.map((item) => item.id);
  await dependencies.repository.markProcessingEnqueueFailed(
    documentIds,
    PROCESSING_ENQUEUE_FAILURE_MESSAGE,
  );

  dependencies.logger.error(
    {
      documentIds,
      ...(queueError === undefined ? {} : { error: summarizeError(queueError) }),
    },
    "Document processing was not enqueued",
  );
}
