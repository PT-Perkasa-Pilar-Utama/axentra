import { describe, expect, it } from "bun:test";
import { createLogger } from "@axentra/observability";
import { PROCESSING_ENQUEUE_FAILURE_MESSAGE, type DocumentProcessingJob } from "@axentra/shared";
import type { StorageAdapter } from "@axentra/storage";
import { InMemoryDocumentProcessingRepository, processDocumentJob } from "./document.processor";
import { DocumentProcessingFailedError, PROCESSING_FAILURE_MESSAGE } from "./processing-failure";

const DOCUMENT_ID = "88888888-8888-4888-8888-888888888888";
const STORAGE_KEY = "documents/88888888-8888-4888-8888-888888888888/rahasia-kunci.pdf";
const EXTRACTED_SECRET = "isi-dokumen-rahasia-4242";

const job: DocumentProcessingJob = {
  jobId: DOCUMENT_ID,
  documentId: DOCUMENT_ID,
  schemaVersion: 1,
  requestedAt: "2026-10-28T00:00:00.000Z",
  storageKey: STORAGE_KEY,
};

// Shaped like drizzle's DrizzleQueryError: the message carries the SQL text and every bound parameter.
class FakeDriverQueryError extends Error {
  public constructor(query: string, params: ReadonlyArray<unknown>) {
    super(`Failed query: ${query}\nparams: ${params.map(String).join(",")}`);
    this.name = "DrizzleQueryError";
  }
}

function seededRepository(): InMemoryDocumentProcessingRepository {
  const repository = new InMemoryDocumentProcessingRepository();
  repository.documents.set(DOCUMENT_ID, {
    id: DOCUMENT_ID,
    title: "Rahasia.pdf",
    processingStatus: "queued",
    errorMessage: null,
    updatedAt: new Date(),
  });
  repository.files.set(DOCUMENT_ID, {
    id: "file-88888888",
    documentId: DOCUMENT_ID,
    storageKey: STORAGE_KEY,
    originalName: "rahasia.pdf",
    mimeType: "application/pdf",
  });
  return repository;
}

function capturingLogger(): { logger: ReturnType<typeof createLogger>; lines: string[] } {
  const lines: string[] = [];
  const logger = createLogger({
    service: "axentra-worker",
    environment: "test",
    version: "0.1.0",
    level: "info",
    destination: {
      write(chunk: string): void {
        lines.push(chunk);
      },
    },
  });
  return { logger, lines };
}

function storageWith(getObject: (key: string) => Promise<Uint8Array>): StorageAdapter {
  return {
    initialize: async () => undefined,
    checkHealth: async () => undefined,
    putObject: async () => undefined,
    getObject,
    deleteObject: async () => undefined,
    headObject: async () => ({
      key: STORAGE_KEY,
      contentLength: 0,
      contentType: "application/pdf",
      checksumSha256: undefined,
    }),
    createDownloadUrl: async () => "https://example.com/download",
    close: async () => undefined,
  };
}

async function captureFailure(promise: Promise<void>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("processing failure copy (F20)", () => {
  it("stores and rethrows only the fixed copy when the completion write fails with a driver error", async () => {
    const repository = seededRepository();
    repository.completeWithMetadata = async () => {
      throw new FakeDriverQueryError("update documents set extracted_text = $1 where id = $2", [
        EXTRACTED_SECRET,
        DOCUMENT_ID,
      ]);
    };
    const pdf = new TextEncoder().encode("%PDF-1.4\n/Author (Dr. Siti Rahma)\n");
    const storage = storageWith(async () => pdf);

    const thrown = await captureFailure(processDocumentJob(job, { repository, storage }));

    expect(thrown).toBeInstanceOf(DocumentProcessingFailedError);
    expect(thrown instanceof Error ? thrown.message : "").toBe(PROCESSING_FAILURE_MESSAGE);
    expect(String(thrown)).not.toContain(EXTRACTED_SECRET);
    const stored = repository.documents.get(DOCUMENT_ID);
    expect(stored?.processingStatus).toBe("failed");
    expect(stored?.errorMessage).toBe(PROCESSING_FAILURE_MESSAGE);
    expect(stored?.errorMessage ?? "").not.toContain(EXTRACTED_SECRET);
  });

  it("logs the driver error as a summary only, without SQL text or parameters", async () => {
    const repository = seededRepository();
    repository.completeWithMetadata = async () => {
      throw new FakeDriverQueryError("insert into document_metadata values ($1)", [
        EXTRACTED_SECRET,
      ]);
    };
    const { logger, lines } = capturingLogger();
    const pdf = new TextEncoder().encode("%PDF-1.4\n");

    await captureFailure(
      processDocumentJob(job, { repository, storage: storageWith(async () => pdf), logger }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const output = lines.join("");
    expect(output).toContain("Document processing failed");
    expect(output).toContain("DrizzleQueryError");
    expect(output).not.toContain(EXTRACTED_SECRET);
    expect(output).not.toContain("insert into document_metadata");
  });

  it("does not store or log the object key when storage reads fail", async () => {
    const repository = seededRepository();
    const { logger, lines } = capturingLogger();
    const storage = storageWith(async (key) => {
      throw new Error(`GetObject failed for ${key}`);
    });

    const thrown = await captureFailure(processDocumentJob(job, { repository, storage, logger }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(thrown instanceof Error ? thrown.message : "").toBe(PROCESSING_FAILURE_MESSAGE);
    expect(repository.documents.get(DOCUMENT_ID)?.errorMessage).toBe(PROCESSING_FAILURE_MESSAGE);
    expect(repository.documents.get(DOCUMENT_ID)?.errorMessage ?? "").not.toContain(STORAGE_KEY);
    expect(lines.join("")).not.toContain(STORAGE_KEY);
  });

  it("keeps the fixed enqueue-failure copy distinct from the processing failure copy", () => {
    expect(PROCESSING_FAILURE_MESSAGE).not.toBe(PROCESSING_ENQUEUE_FAILURE_MESSAGE);
    expect(PROCESSING_FAILURE_MESSAGE).toContain("Pemrosesan dokumen gagal");
  });
});
