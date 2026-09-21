import { describe, expect, it } from "bun:test";
import { createLogger } from "@axentra/observability";
import type { ApiSuccessEnvelope, DocumentMetadataResult } from "@axentra/shared";
import type { StorageAdapter } from "@axentra/storage";
import { createApp } from "../../app";
import { createAuthService } from "../auth/auth.service";
import { createDocumentService } from "./documents.service";
import { InMemoryDocumentMetadataRepository } from "./metadata.repository";
import {
  InMemoryDocumentProcessingRepository,
  processDocumentJob,
} from "../../../../worker/src/processors/document.processor";

const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

describe("Document Processing Lifecycle Integration (Task BE-S1-05 / F2, F7 & F8)", () => {
  it("processes uploaded document through worker lifecycle and serves result via API endpoint", async () => {
    const docId = "77777777-7777-4777-8777-777777777777";
    const storageKey = `uploads/${docId}/laporan.pdf`;

    // 1. In-memory simulated storage and repositories
    const storageFiles = new Map<string, Uint8Array>();
    const pdfContent = `%PDF-1.4\n1 0 obj\n<< /Title (Laporan Keuangan Q3) /Author (Dewi Lestari) >>\nendobj\n%%EOF`;
    storageFiles.set(storageKey, Buffer.from(pdfContent, "utf-8"));

    const mockStorage: StorageAdapter = {
      initialize: async () => undefined,
      checkHealth: async () => undefined,
      putObject: async () => undefined,
      getObject: async (key: string) => {
        const file = storageFiles.get(key);
        if (!file) throw new Error("File tidak ditemukan di object storage");
        return file;
      },
      deleteObject: async () => undefined,
      headObject: async () => ({
        key: storageKey,
        contentLength: 100,
        contentType: "application/pdf",
        checksumSha256: undefined,
      }),
      createDownloadUrl: async () => "https://example.com/download",
      close: async () => undefined,
    };

    const metadataRepository = new InMemoryDocumentMetadataRepository();
    metadataRepository.addDocument({
      id: docId,
      title: "Laporan Keuangan Q3.pdf",
      processingStatus: "queued",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const processingRepository = new InMemoryDocumentProcessingRepository(
      async (documentId, meta) => {
        await metadataRepository.saveMetadata({
          documentId,
          author: meta.author,
          rawMetadata: meta.rawMetadata,
          extractedAt: meta.extractedAt,
        });
      },
    );

    processingRepository.documents.set(docId, {
      id: docId,
      title: "Laporan Keuangan Q3.pdf",
      processingStatus: "queued",
      errorMessage: null,
      updatedAt: new Date(),
    });

    processingRepository.files.set(docId, {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      documentId: docId,
      storageKey,
      originalName: "Laporan Keuangan Q3.pdf",
      mimeType: "application/pdf",
    });

    // 2. Set up API application with metadataRepository
    const authService = createAuthService({
      authenticator: (creds) => {
        if (creds.email === "member@axentra.local") {
          return {
            id: "usr-member-lifecycle",
            email: "member@axentra.local",
            role: "member_team",
            name: "Member Lifecycle",
          };
        }
        return null;
      },
    });

    const documentService = createDocumentService({
      metadataRepository,
    });

    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      authService,
      documentService,
    });

    const login = await authService.login({
      email: "member@axentra.local",
      password: "any",
    });

    // 3. Before worker processing: metadata endpoint returns 404 (Metadata belum ada)
    const beforeResponse = await app.request(`/api/v1/documents/${docId}/metadata`, {
      method: "GET",
      headers: { authorization: `Bearer ${login.token}` },
    });
    expect(beforeResponse.status).toBe(404);

    // 4. Trigger worker processing for the document
    await processDocumentJob(
      {
        jobId: "job-1111-2222-3333-4444",
        documentId: docId,
        schemaVersion: 1,
        requestedAt: new Date().toISOString(),
      },
      {
        repository: processingRepository,
        storage: mockStorage,
      },
    );

    // Document status in repository should now be 'completed'
    expect(processingRepository.documents.get(docId)?.processingStatus).toBe("completed");

    // 5. After worker processing: metadata endpoint returns 200 OK with extracted author
    const afterResponse = await app.request(`/api/v1/documents/${docId}/metadata`, {
      method: "GET",
      headers: { authorization: `Bearer ${login.token}` },
    });
    expect(afterResponse.status).toBe(200);

    const json = (await afterResponse.json()) as ApiSuccessEnvelope<DocumentMetadataResult>;
    expect(json.success).toBe(true);
    expect(json.data.documentId).toBe(docId);
    expect(json.data.author).toBe("Dewi Lestari");
    expect(json.data.extractedAt).toBeDefined();
  });
});
