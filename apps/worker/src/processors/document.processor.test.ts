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

  it("retries a document left failed by an enqueue outage and marks it completed", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    repository.documents.set(validJob.documentId, {
      id: validJob.documentId,
      title: "Laporan Riset.pdf",
      processingStatus: "failed",
    });
    const storageKey = "documents/laporan.pdf";
    repository.files.set(validJob.documentId, {
      id: "file-1",
      documentId: validJob.documentId,
      storageKey,
      originalName: "Laporan Riset.pdf",
      mimeType: "application/pdf",
    });
    const pdf = new TextEncoder().encode("%PDF-1.4\n/Author (Dr. Siti Rahma)\n");
    await processDocumentJob(validJob, {
      repository,
      storage: createMockStorage(new Map([[storageKey, pdf]])),
    });

    expect(repository.documents.get(validJob.documentId)?.processingStatus).toBe("completed");
  });

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

  it("extracts and persists up to 3 smart tags during processing (Task BE-S2-01 / AC-04.02)", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    repository.documents.set(validJob.documentId, {
      id: validJob.documentId,
      title: "Laporan Keuangan Tahunan.pdf",
      processingStatus: "queued",
      errorMessage: null,
      updatedAt: new Date(),
    });

    const storageKey = `docs/${validJob.documentId}/laporan-keuangan-tahunan.pdf`;
    repository.files.set(validJob.documentId, {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      documentId: validJob.documentId,
      storageKey,
      originalName: "Laporan-Keuangan-Tahunan.pdf",
      mimeType: "application/pdf",
    });

    const pdfContent = `%PDF-1.4\n1 0 obj\n<< /Title (Laporan Keuangan) /Author (Dr. Siti Rahma) /Keywords (finance, strategy, reporting, extra-tag) >>\nendobj\n%%EOF`;
    const filesMap = new Map<string, Uint8Array>();
    filesMap.set(storageKey, Buffer.from(pdfContent, "utf-8"));
    const storage = createMockStorage(filesMap);

    await processDocumentJob(validJob, {
      repository,
      storage,
    });

    const doc = repository.documents.get(validJob.documentId);
    expect(doc?.processingStatus).toBe("completed");

    const tags = repository.documentTags.get(validJob.documentId);
    expect(tags).toBeDefined();
    expect(tags?.length).toBeLessThanOrEqual(3);
    expect(tags).toEqual(["finance", "strategy", "reporting"]);
  });

  it("extracts smart tags from filename when no metadata keywords are in PDF", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    repository.documents.set(validJob.documentId, {
      id: validJob.documentId,
      title: "strategy-legal-contract.pdf",
      processingStatus: "queued",
      errorMessage: null,
      updatedAt: new Date(),
    });

    const storageKey = `docs/${validJob.documentId}/strategy-legal-contract.pdf`;
    repository.files.set(validJob.documentId, {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      documentId: validJob.documentId,
      storageKey,
      originalName: "strategy-legal-contract.pdf",
      mimeType: "application/pdf",
    });

    const pdfContent = `%PDF-1.4\n1 0 obj\n<< /Author (Dr. Siti Rahma) >>\nendobj\n%%EOF`;
    const filesMap = new Map<string, Uint8Array>();
    filesMap.set(storageKey, Buffer.from(pdfContent, "utf-8"));
    const storage = createMockStorage(filesMap);

    await processDocumentJob(validJob, {
      repository,
      storage,
    });

    const tags = repository.documentTags.get(validJob.documentId);
    expect(tags).toBeDefined();
    expect(tags).toEqual(["strategy", "legal", "contract"]);
  });

  it("extracts smart tags from document body text when filename has no keywords (F1)", async () => {
    const repository = new InMemoryDocumentProcessingRepository();
    repository.documents.set(validJob.documentId, {
      id: validJob.documentId,
      title: "sample-doc-1234.pdf",
      processingStatus: "queued",
      errorMessage: null,
      updatedAt: new Date(),
    });

    const storageKey = `docs/${validJob.documentId}/sample-doc-1234.pdf`;
    repository.files.set(validJob.documentId, {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      documentId: validJob.documentId,
      storageKey,
      originalName: "sample-doc-1234.pdf",
      mimeType: "application/pdf",
    });

    const pdfContent = `%PDF-1.4
1 0 obj
<< /Author (Dr. Siti Rahma) >>
endobj
2 0 obj
<< /Length 100 >>
stream
BT
/F1 12 Tf
(This report details the annual fiscal budget allocation, tax calculation, and procurement guidelines.) Tj
ET
endstream
endobj
%%EOF`;
    const filesMap = new Map<string, Uint8Array>();
    filesMap.set(storageKey, Buffer.from(pdfContent, "latin1"));
    const storage = createMockStorage(filesMap);

    await processDocumentJob(validJob, {
      repository,
      storage,
    });

    const doc = repository.documents.get(validJob.documentId);
    expect(doc?.processingStatus).toBe("completed");

    const tags = repository.documentTags.get(validJob.documentId);
    expect(tags).toBeDefined();
    expect(tags?.length).toBe(3);
    expect(tags).toContain("budget");
    expect(tags).toContain("tax");
    expect(tags).toContain("procurement");
    expect(tags).not.toContain("sample");
  });

  describe("Auto-Category Assignment (Task BE-S2-04 / AC-05.01 & AC-05.02)", () => {
    it("assigns Reporting category, creates category with inactive download permission per AC-05.01", async () => {
      const repository = new InMemoryDocumentProcessingRepository();
      const docId = "33333333-3333-4333-8333-333333333333";
      repository.documents.set(docId, {
        id: docId,
        title: "doc-sample-101.pdf",
        processingStatus: "queued",
      });
      const storageKey = `docs/${docId}/doc-sample-101.pdf`;
      repository.files.set(docId, {
        id: "file-cat-1",
        documentId: docId,
        storageKey,
        originalName: "doc-sample-101.pdf",
        mimeType: "application/pdf",
      });

      const pdfContent = `%PDF-1.4
1 0 obj
<< /Author (Finance Lead) >>
endobj
2 0 obj
<< /Length 100 >>
stream
BT
/F1 12 Tf
(This document contains Q3 Reporting data and performance Reporting summary.) Tj
ET
endstream
endobj
%%EOF`;
      const filesMap = new Map<string, Uint8Array>();
      filesMap.set(storageKey, Buffer.from(pdfContent, "latin1"));
      const storage = createMockStorage(filesMap);

      await processDocumentJob(
        {
          jobId: "job-cat-1",
          documentId: docId,
          schemaVersion: 1,
          requestedAt: new Date().toISOString(),
        },
        { repository, storage },
      );

      const doc = repository.documents.get(docId);
      expect(doc?.processingStatus).toBe("completed");
      expect(doc?.categoryId).toBeDefined();

      const createdCat = Array.from(repository.categories.values()).find(
        (c) => c.name === "Reporting",
      );
      expect(createdCat).toBeDefined();
      expect(createdCat?.slug).toBe("reporting");
      expect(doc?.categoryId).toBe(createdCat?.id);

      const permission = repository.permissions.get(createdCat?.id ?? "");
      expect(permission).toBeDefined();
      expect(permission?.downloadEnabled).toBe(false);
    });

    it("assigns different categories for Reporting and Contract documents per AC-05.02", async () => {
      const repository = new InMemoryDocumentProcessingRepository();
      const doc1Id = "44444444-4444-4444-8444-444444444444";
      const doc2Id = "55555555-5555-4555-8555-555555555555";

      repository.documents.set(doc1Id, {
        id: doc1Id,
        title: "doc-sample-201.pdf",
        processingStatus: "queued",
      });
      repository.documents.set(doc2Id, {
        id: doc2Id,
        title: "doc-sample-202.pdf",
        processingStatus: "queued",
      });

      const storageKey1 = `docs/${doc1Id}/doc-sample-201.pdf`;
      const storageKey2 = `docs/${doc2Id}/doc-sample-202.pdf`;

      repository.files.set(doc1Id, {
        id: "f-1",
        documentId: doc1Id,
        storageKey: storageKey1,
        originalName: "doc-sample-201.pdf",
        mimeType: "application/pdf",
      });
      repository.files.set(doc2Id, {
        id: "f-2",
        documentId: doc2Id,
        storageKey: storageKey2,
        originalName: "doc-sample-202.pdf",
        mimeType: "application/pdf",
      });

      const pdf1 = `%PDF-1.4
1 0 obj
<< /Length 50 >>
stream
BT (Isi konten mengenai Reporting tahunan.) Tj ET
endstream
endobj
%%EOF`;
      const pdf2 = `%PDF-1.4
1 0 obj
<< /Length 50 >>
stream
BT (Isi konten mengenai Contract pengadaan sistem.) Tj ET
endstream
endobj
%%EOF`;

      const filesMap = new Map<string, Uint8Array>([
        [storageKey1, Buffer.from(pdf1, "latin1")],
        [storageKey2, Buffer.from(pdf2, "latin1")],
      ]);
      const storage = createMockStorage(filesMap);

      await processDocumentJob(
        {
          jobId: "j-1",
          documentId: doc1Id,
          schemaVersion: 1,
          requestedAt: new Date().toISOString(),
        },
        { repository, storage },
      );
      await processDocumentJob(
        {
          jobId: "j-2",
          documentId: doc2Id,
          schemaVersion: 1,
          requestedAt: new Date().toISOString(),
        },
        { repository, storage },
      );

      const doc1 = repository.documents.get(doc1Id);
      const doc2 = repository.documents.get(doc2Id);

      expect(doc1?.categoryId).toBeDefined();
      expect(doc2?.categoryId).toBeDefined();
      expect(doc1?.categoryId).not.toBe(doc2?.categoryId);

      const cat1 = repository.categories.get(doc1?.categoryId ?? "");
      const cat2 = repository.categories.get(doc2?.categoryId ?? "");

      expect(cat1?.name).toBe("Reporting");
      expect(cat2?.name).toBe("Contract");
    });
  });
});
