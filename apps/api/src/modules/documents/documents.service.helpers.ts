import path from "node:path";
import type { StorageAdapter } from "@axentra/storage";
import {
  DOCUMENT_COPY,
  DOCUMENT_ERROR_CODES,
  type DocumentMetadataResult,
  type RecentDocument,
} from "@axentra/shared";
import { ConflictError, PayloadTooLargeError } from "../../http/errors";
import type {
  CreateDocumentBatchItem,
  IDocumentRepository,
  RecentDocumentPage,
} from "./documents.repository";
import type { DocumentMetadataRecord } from "./metadata.repository";

export function formatMetadataResult(record: DocumentMetadataRecord): DocumentMetadataResult {
  return {
    id: record.id,
    documentId: record.documentId,
    author: record.author,
    rawMetadata: record.rawMetadata,
    extractedAt: record.extractedAt ? record.extractedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function sanitizeFilename(filename: string): string {
  const base = path.basename(filename).trim();
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned : "document";
}

export function createInMemoryRepository(): IDocumentRepository {
  const existingHashes = new Set<string>();
  const hashToDocId = new Map<string, string>();
  const savedBatches: CreateDocumentBatchItem[][] = [];
  const recentDocuments: RecentDocument[] = [];
  return {
    findExistingHashes: async (hashes) => {
      const found = new Set<string>();
      for (const h of hashes) {
        if (existingHashes.has(h)) found.add(h);
      }
      return found;
    },
    findByContentHash: async (contentHash: string) => {
      const docId = hashToDocId.get(contentHash);
      if (!docId) return null;
      return { documentId: docId, contentHash };
    },
    listRecentDocuments: async (page, limit): Promise<RecentDocumentPage> => {
      const start = (page - 1) * limit;
      return {
        items: recentDocuments.slice(start, start + limit),
        meta: { page, limit, total: recentDocuments.length },
      };
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
        hashToDocId.set(item.contentHash, item.id);
        recentDocuments.unshift({
          id: item.id,
          filename: item.originalName,
          processingStatus: "queued",
          createdAt: new Date().toISOString(),
        });
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
    markProcessingEnqueueFailed: async () => undefined,
  };
}

/**
 * Creates a bounded stream that counts incoming bytes and aborts immediately
 * with PayloadTooLargeError as soon as total bytes exceed maxBytes.
 */
export function createBoundedStream(
  source: ReadableStream<Uint8Array>,
  maxBytes: number,
): ReadableStream<Uint8Array> {
  let totalBytes = 0;
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        controller.error(new PayloadTooLargeError(DOCUMENT_COPY.FILE_TOO_LARGE));
        return;
      }
      controller.enqueue(chunk);
    },
  });
  return source.pipeThrough(transform);
}

export function createInMemoryStorage(): StorageAdapter {
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
