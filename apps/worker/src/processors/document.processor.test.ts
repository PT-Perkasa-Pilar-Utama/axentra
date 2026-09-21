import { describe, expect, it } from "bun:test";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { StorageAdapter } from "@axentra/storage";
import type { DocumentProcessingJob } from "@axentra/shared";
import { processDocumentJob } from "./document.processor";

type MockDoc = {
  id: string;
  title: string;
  processingStatus: "queued" | "processing" | "completed" | "failed";
  errorMessage: string | null;
  updatedAt: Date;
};

type MockFile = {
  id: string;
  documentId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
};

type MockMetadata = {
  documentId: string;
  author: string | null;
  rawMetadata: Record<string, unknown> | null;
  extractedAt: Date | null;
};

function createMockDb() {
  const docs = new Map<string, MockDoc>();
  const files = new Map<string, MockFile>();
  const metadata = new Map<string, MockMetadata>();

  const db = {
    docs,
    files,
    metadata,
    select: () => ({
      from: (table: { [key: string]: unknown }) => ({
        where: () => ({
          limit: () => {
            // Check which table was queried
            // If table has title, it's documents table
            if ("title" in table) {
              const first = Array.from(docs.values())[0];
              return Promise.resolve(first ? [first] : []);
            }
            // If table has storageKey, it's documentFiles table
            if ("storageKey" in table) {
              const first = Array.from(files.values())[0];
              return Promise.resolve(first ? [first] : []);
            }
            return Promise.resolve([]);
          },
        }),
      }),
    }),
    update: () => ({
      set: (updates: Partial<MockDoc>) => ({
        where: () => {
          const first = Array.from(docs.values())[0];
          if (first) {
            Object.assign(first, updates);
          }
          return Promise.resolve();
        },
      }),
    }),
    insert: () => ({
      values: (values: MockMetadata) => ({
        onConflictDoUpdate: () => {
          metadata.set(values.documentId, values);
          return Promise.resolve();
        },
      }),
    }),
  };

  return db;
}

function createMockStorage(filesMap: Map<string, Uint8Array>): StorageAdapter {
  return {
    initialize: async () => undefined,
    checkHealth: async () => undefined,
    putObject: async () => undefined,
    getObject: async (key: string) => {
      const found = filesMap.get(key);
      if (!found) throw new Error("Object not found in mock storage");
      return found;
    },
    deleteObject: async () => undefined,
    headObject: async () => ({
      key: "dummy",
      contentLength: 100,
      contentType: "application/pdf",
      checksumSha256: undefined,
    }),
    createDownloadUrl: async () => "https://example.com/download",
    close: async () => undefined,
  };
}

describe("Document Worker Processor (Task BE-S1-05 / F2)", () => {
  const validJob: DocumentProcessingJob = {
    jobId: "11111111-1111-4111-8111-111111111111",
    documentId: "22222222-2222-4222-8222-222222222222",
    schemaVersion: 1,
    requestedAt: new Date().toISOString(),
  };

  it("processes a queued document, extracts author from PDF, and marks completed", async () => {
    const mockDb = createMockDb();
    mockDb.docs.set(validJob.documentId, {
      id: validJob.documentId,
      title: "Laporan Riset.pdf",
      processingStatus: "queued",
      errorMessage: null,
      updatedAt: new Date(),
    });

    const storageKey = `docs/${validJob.documentId}/laporan.pdf`;
    mockDb.files.set(validJob.documentId, {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      documentId: validJob.documentId,
      storageKey,
      originalName: "laporan.pdf",
      mimeType: "application/pdf",
    });

    const pdfContent = `%PDF-1.4\n1 0 obj\n<< /Title (Laporan Riset) /Author (Dr. Siti Rahma) >>\nendobj\n%%EOF`;
    const filesMap = new Map<string, Uint8Array>();
    filesMap.set(storageKey, Buffer.from(pdfContent, "utf-8"));
    const storage = createMockStorage(filesMap);

    await processDocumentJob(validJob, {
      db: mockDb as unknown as PostgresJsDatabase,
      storage,
    });

    // Verify document status transitioned to completed
    const updatedDoc = mockDb.docs.get(validJob.documentId);
    expect(updatedDoc?.processingStatus).toBe("completed");
    expect(updatedDoc?.errorMessage).toBeNull();

    // Verify metadata was persisted
    const persistedMeta = mockDb.metadata.get(validJob.documentId);
    expect(persistedMeta).toBeDefined();
    expect(persistedMeta?.author).toBe("Dr. Siti Rahma");
  });

  it("is idempotent: skips document that is already completed", async () => {
    const mockDb = createMockDb();
    mockDb.docs.set(validJob.documentId, {
      id: validJob.documentId,
      title: "Laporan.pdf",
      processingStatus: "completed",
      errorMessage: null,
      updatedAt: new Date(),
    });

    const storage = createMockStorage(new Map());

    await processDocumentJob(validJob, {
      db: mockDb as unknown as PostgresJsDatabase,
      storage,
    });

    const doc = mockDb.docs.get(validJob.documentId);
    expect(doc?.processingStatus).toBe("completed");
    expect(mockDb.metadata.size).toBe(0);
  });

  it("marks document as failed when associated file record is missing", async () => {
    const mockDb = createMockDb();
    mockDb.docs.set(validJob.documentId, {
      id: validJob.documentId,
      title: "Tanpa File.pdf",
      processingStatus: "queued",
      errorMessage: null,
      updatedAt: new Date(),
    });

    const storage = createMockStorage(new Map());

    await processDocumentJob(validJob, {
      db: mockDb as unknown as PostgresJsDatabase,
      storage,
    });

    const doc = mockDb.docs.get(validJob.documentId);
    expect(doc?.processingStatus).toBe("failed");
    expect(doc?.errorMessage).toContain("File dokumen tidak ditemukan");
  });

  it("records failed status when object storage throws an error", async () => {
    const mockDb = createMockDb();
    mockDb.docs.set(validJob.documentId, {
      id: validJob.documentId,
      title: "Rusak.pdf",
      processingStatus: "queued",
      errorMessage: null,
      updatedAt: new Date(),
    });

    mockDb.files.set(validJob.documentId, {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      documentId: validJob.documentId,
      storageKey: "missing-in-s3.pdf",
      originalName: "rusak.pdf",
      mimeType: "application/pdf",
    });

    const emptyStorage = createMockStorage(new Map()); // file not in storage

    await expect(
      processDocumentJob(validJob, {
        db: mockDb as unknown as PostgresJsDatabase,
        storage: emptyStorage,
      }),
    ).rejects.toThrow("Object not found in mock storage");

    const doc = mockDb.docs.get(validJob.documentId);
    expect(doc?.processingStatus).toBe("failed");
    expect(doc?.errorMessage).toBe("Object not found in mock storage");
  });
});
