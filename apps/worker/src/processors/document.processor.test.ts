import { describe, expect, it } from "bun:test";
import type { StorageAdapter } from "@axentra/storage";
import type { DocumentProcessingJob } from "@axentra/shared";
import { InMemoryDocumentProcessingRepository, processDocumentJob } from "./document.processor";

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

describe("Document Worker Processor (Task BE-S1-05 / F2 & F7)", () => {
  const validJob: DocumentProcessingJob = {
    jobId: "11111111-1111-4111-8111-111111111111",
    documentId: "22222222-2222-4222-8222-222222222222",
    schemaVersion: 1,
    requestedAt: new Date().toISOString(),
  };

  it("processes a queued document, extracts author from PDF, and marks completed", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    repository.documents.set(validJob.documentId, {
      id: validJob.documentId,
      title: "Laporan Riset.pdf",
      processingStatus: "queued",
      errorMessage: null,
      updatedAt: new Date(),
    });

    const storageKey = `docs/${validJob.documentId}/laporan.pdf`;
    repository.files.set(validJob.documentId, {
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
      repository,
      storage,
    });

    // Verify document status transitioned to completed
    const updatedDoc = repository.documents.get(validJob.documentId);
    expect(updatedDoc?.processingStatus).toBe("completed");
    expect(updatedDoc?.errorMessage).toBeNull();

    // Verify metadata was persisted
    const persistedMeta = repository.metadata.get(validJob.documentId);
    expect(persistedMeta).toBeDefined();
    expect(persistedMeta?.author).toBe("Dr. Siti Rahma");
  });

  it("is idempotent: skips document that is already completed", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    repository.documents.set(validJob.documentId, {
      id: validJob.documentId,
      title: "Laporan.pdf",
      processingStatus: "completed",
      errorMessage: null,
      updatedAt: new Date(),
    });

    const storage = createMockStorage(new Map());

    await processDocumentJob(validJob, {
      repository,
      storage,
    });

    const doc = repository.documents.get(validJob.documentId);
    expect(doc?.processingStatus).toBe("completed");
    expect(repository.metadata.size).toBe(0);
  });

  it("marks document as failed when associated file record is missing", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    repository.documents.set(validJob.documentId, {
      id: validJob.documentId,
      title: "Tanpa File.pdf",
      processingStatus: "queued",
      errorMessage: null,
      updatedAt: new Date(),
    });

    const storage = createMockStorage(new Map());

    await processDocumentJob(validJob, {
      repository,
      storage,
    });

    const doc = repository.documents.get(validJob.documentId);
    expect(doc?.processingStatus).toBe("failed");
    expect(doc?.errorMessage).toContain("File dokumen tidak ditemukan");
  });

  it("records failed status when object storage throws an error", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    repository.documents.set(validJob.documentId, {
      id: validJob.documentId,
      title: "Rusak.pdf",
      processingStatus: "queued",
      errorMessage: null,
      updatedAt: new Date(),
    });

    repository.files.set(validJob.documentId, {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      documentId: validJob.documentId,
      storageKey: "missing-in-s3.pdf",
      originalName: "rusak.pdf",
      mimeType: "application/pdf",
    });

    const emptyStorage = createMockStorage(new Map());

    await expect(
      processDocumentJob(validJob, {
        repository,
        storage: emptyStorage,
      }),
    ).rejects.toThrow("Object not found in mock storage");

    const doc = repository.documents.get(validJob.documentId);
    expect(doc?.processingStatus).toBe("failed");
    expect(doc?.errorMessage).toBe("Object not found in mock storage");
  });

  it("handles failure in completeWithMetadata atomically and marks document as failed (Finding F7)", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    repository.shouldFailOnComplete = true;

    repository.documents.set(validJob.documentId, {
      id: validJob.documentId,
      title: "FailTx.pdf",
      processingStatus: "queued",
      errorMessage: null,
      updatedAt: new Date(),
    });

    const storageKey = `docs/${validJob.documentId}/fail.pdf`;
    repository.files.set(validJob.documentId, {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      documentId: validJob.documentId,
      storageKey,
      originalName: "fail.pdf",
      mimeType: "application/pdf",
    });

    const pdfContent = `%PDF-1.4\n1 0 obj\n<< /Title (FailTx) /Author (Dr. Siti) >>\nendobj\n%%EOF`;
    const filesMap = new Map<string, Uint8Array>();
    filesMap.set(storageKey, Buffer.from(pdfContent, "utf-8"));
    const storage = createMockStorage(filesMap);

    await expect(
      processDocumentJob(validJob, {
        repository,
        storage,
      }),
    ).rejects.toThrow("Simulated transaction failure in completeWithMetadata");

    // Atomicity assertion: metadata must NOT be persisted if completion fails
    expect(repository.metadata.has(validJob.documentId)).toBe(false);

    // Document status must be marked as failed
    const doc = repository.documents.get(validJob.documentId);
    expect(doc?.processingStatus).toBe("failed");
    expect(doc?.errorMessage).toBe("Simulated transaction failure in completeWithMetadata");
  });
});
