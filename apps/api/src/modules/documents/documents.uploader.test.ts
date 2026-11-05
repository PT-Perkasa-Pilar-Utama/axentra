import { describe, expect, test } from "bun:test";
import { createLogger } from "@axentra/observability";
import type { QueueProducer } from "@axentra/queue";
import type { AuthUser } from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import type { CreateDocumentBatchItem, IDocumentRepository } from "./documents.repository";
import { createDocumentService } from "./documents.service";
import { createInMemoryRepository, createInMemoryStorage } from "./documents.service.helpers";

// Covers DB-S4-01 uploader ownership: every document saved by an upload records the user who uploaded it.
const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const UPLOADER: AuthUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "member@axentra.local",
  role: "member_team",
  name: "Member Test",
};

const tokenVerifier: TokenVerifier = {
  verifyToken(token: string): AuthUser | null {
    return token === "uploader-token" ? UPLOADER : null;
  },
};

const pdfBytes = new TextEncoder().encode("%PDF-1.4\n% uploader check\n");

// Accepts the processing job so an upload completes instead of failing on a missing queue.
const queue: QueueProducer = {
  enqueueSystemHealthCheck: async () => "health-job",
  enqueueDocumentProcessing: async (payload) => payload.jobId,
  reconcileDocumentProcessing: async (payload) => payload.jobId,
  close: async () => undefined,
};

// Wraps the in-memory repository so the test can read the batch items that the upload saved.
function recordingRepository(): {
  repository: IDocumentRepository;
  saved: CreateDocumentBatchItem[];
} {
  const inMemory = createInMemoryRepository();
  const saved: CreateDocumentBatchItem[] = [];
  return {
    saved,
    repository: {
      ...inMemory,
      saveDocumentBatch: async (items) => {
        saved.push(...items);
        return inMemory.saveDocumentBatch(items);
      },
    },
  };
}

describe("document uploader ownership (DB-S4-01)", () => {
  test("service stores the uploader id on the saved document", async () => {
    const { repository, saved } = recordingRepository();
    const service = createDocumentService({
      repository,
      storage: createInMemoryStorage(),
      logger: testLogger,
      queue,
    });

    await service.uploadDocuments(
      [
        {
          filename: "laporan.pdf",
          mimeType: "application/pdf",
          size: pdfBytes.byteLength,
          bytes: pdfBytes,
        },
      ],
      UPLOADER.id,
    );

    expect(saved.map((item) => item.uploadedBy)).toEqual([UPLOADER.id]);
  });

  test("POST /documents/upload records the authenticated member as the uploader", async () => {
    const { repository, saved } = recordingRepository();
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      documentService: createDocumentService({
        repository,
        storage: createInMemoryStorage(),
        logger: testLogger,
        queue,
      }),
      tokenVerifier,
      enableUploadRoute: true,
    });
    const formData = new FormData();
    formData.append("file", new Blob([pdfBytes], { type: "application/pdf" }), "laporan.pdf");

    const response = await app.request("/api/v1/documents/upload", {
      method: "POST",
      headers: { authorization: "Bearer uploader-token" },
      body: formData,
    });

    expect(response.status).toBe(200);
    expect(saved.map((item) => item.uploadedBy)).toEqual([UPLOADER.id]);
  });
});
