import { describe, expect, it } from "bun:test";
import { NotFoundError } from "../../http/errors";
import { createDocumentService } from "./documents.service";
import { InMemoryDocumentMetadataRepository } from "./metadata.repository";
import { DeterministicMetadataExtractor } from "./metadata.extractor";

describe("DocumentService - Metadata Operations (Task BE-S1-05)", () => {
  it("throws NotFoundError when document does not exist", async () => {
    const repository = new InMemoryDocumentMetadataRepository();
    const service = createDocumentService({ metadataRepository: repository });

    await expect(
      service.getDocumentMetadata("99999999-9999-4999-8999-999999999999"),
    ).rejects.toThrow(NotFoundError);

    await expect(
      service.extractAndStoreMetadata("99999999-9999-4999-8999-999999999999"),
    ).rejects.toThrow(NotFoundError);

    await expect(
      service.storeMetadata({
        documentId: "99999999-9999-4999-8999-999999999999",
        author: "Test",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when document exists but metadata record does not", async () => {
    const repository = new InMemoryDocumentMetadataRepository();
    const service = createDocumentService({ metadataRepository: repository });
    const docId = "11111111-1111-4111-8111-111111111111";

    repository.addDocument({
      id: docId,
      title: "Dokumen Baru.pdf",
      processingStatus: "queued",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    try {
      await service.getDocumentMetadata(docId);
      expect().fail("Should have thrown NotFoundError");
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).message).toBe("Metadata dokumen tidak ditemukan");
    }
  });

  it("extracts, stores, and retrieves metadata end-to-end", async () => {
    const repository = new InMemoryDocumentMetadataRepository();
    const extractor = new DeterministicMetadataExtractor();
    const service = createDocumentService({
      metadataRepository: repository,
      metadataExtractor: extractor,
    });

    const docId = "22222222-2222-4222-8222-222222222222";
    repository.addDocument({
      id: docId,
      title: "Laporan Riset.pdf",
      processingStatus: "queued",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const pdfBytes = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Title (Laporan Riset) /Author (Dr. Bambang Santoso) >>\nendobj\n%%EOF",
    );

    const extracted = await service.extractAndStoreMetadata(docId, {
      filename: "Laporan Riset.pdf",
      mimeType: "application/pdf",
      buffer: pdfBytes,
    });

    expect(extracted.documentId).toBe(docId);
    expect(extracted.author).toBe("Dr. Bambang Santoso");
    expect(extracted.rawMetadata?.extractor).toBe("deterministic-placeholder");
    expect(typeof extracted.extractedAt).toBe("string");
    expect(typeof extracted.createdAt).toBe("string");
    expect(typeof extracted.updatedAt).toBe("string");

    // Retrieve via getDocumentMetadata
    const retrieved = await service.getDocumentMetadata(docId);
    expect(retrieved.id).toBe(extracted.id);
    expect(retrieved.author).toBe("Dr. Bambang Santoso");
  });

  it("allows direct storage via storeMetadata", async () => {
    const repository = new InMemoryDocumentMetadataRepository();
    const service = createDocumentService({ metadataRepository: repository });

    const docId = "33333333-3333-4333-8333-333333333333";
    repository.addDocument({
      id: docId,
      title: "Manual.docx",
      processingStatus: "completed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const stored = await service.storeMetadata({
      documentId: docId,
      author: "Jane Doe",
      rawMetadata: { manual: true },
    });

    expect(stored.documentId).toBe(docId);
    expect(stored.author).toBe("Jane Doe");

    const retrieved = await service.getDocumentMetadata(docId);
    expect(retrieved.author).toBe("Jane Doe");
    expect(retrieved.rawMetadata?.manual).toBe(true);
  });

  it("enqueues processing job when queueProducer is provided", async () => {
    let enqueuedJobName = "";
    let enqueuedPayload: unknown = null;

    const mockProducer = {
      enqueueSystemHealthCheck: async () => "health-id",
      enqueueDocumentProcessing: async (payload: unknown) => {
        enqueuedJobName = "document.process";
        enqueuedPayload = payload;
        return "job-12345";
      },
      close: async () => undefined,
    };

    const service = createDocumentService({
      queueProducer: mockProducer,
    });

    const docId = "44444444-4444-4444-8444-444444444444";
    const jobId = await service.enqueueProcessingJob(docId);

    expect(jobId).toBe("job-12345");
    expect(enqueuedJobName).toBe("document.process");
    expect((enqueuedPayload as { documentId: string }).documentId).toBe(docId);
  });

  it("throws error when enqueueProcessingJob is called without queueProducer", async () => {
    const service = createDocumentService();
    await expect(
      service.enqueueProcessingJob("55555555-5555-4555-8555-555555555555"),
    ).rejects.toThrow("QueueProducer tidak tersedia untuk memproses dokumen");
  });
});
