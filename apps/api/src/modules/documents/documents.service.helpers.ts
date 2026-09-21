import path from "node:path";
import type { StorageAdapter } from "@axentra/storage";
import { DOCUMENT_COPY, DOCUMENT_ERROR_CODES, type DocumentMetadataResult } from "@axentra/shared";
import { ConflictError } from "../../http/errors";
import type { CreateDocumentBatchItem, IDocumentRepository } from "./documents.repository";
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
