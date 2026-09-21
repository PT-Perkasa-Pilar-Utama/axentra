import { describe, expect, it } from "bun:test";
import { createLogger } from "@axentra/observability";
import type { ApiSuccessEnvelope, DocumentMetadataResult } from "@axentra/shared";
import { createApp } from "../../app";
import { createAuthService } from "../auth/auth.service";
import { createDocumentService } from "./documents.service";
import { InMemoryDocumentMetadataRepository } from "./metadata.repository";
import { processDocumentJob } from "../../../../worker/src/processors/document.processor";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { StorageAdapter } from "@axentra/storage";

const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

describe("Document Processing Lifecycle Integration (Task BE-S1-05 / F2 & F5)", () => {
  it("processes uploaded document through worker lifecycle and serves result via API endpoint", async () => {
    const docId = "77777777-7777-4777-8777-777777777777";
    const storageKey = `uploads/${docId}/laporan.pdf`;

    // 1. In-memory simulated storage and database
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

    type LifecycleDoc = {
      id: string;
      title: string;
      processingStatus: "queued" | "processing" | "completed" | "failed";
      errorMessage: string | null;
      updatedAt: Date;
    };

    // Simulated database records
    const docs = new Map<string, LifecycleDoc>([
      [
        docId,
        {
          id: docId,
          title: "Laporan Keuangan Q3.pdf",
          processingStatus: "queued",
          errorMessage: null,
          updatedAt: new Date(),
        },
      ],
    ]);

    const files = new Map([
      [
        docId,
        {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          documentId: docId,
          storageKey,
          originalName: "Laporan Keuangan Q3.pdf",
          mimeType: "application/pdf",
        },
      ],
    ]);

    const metadataRepository = new InMemoryDocumentMetadataRepository();
    metadataRepository.addDocument({
      id: docId,
      title: "Laporan Keuangan Q3.pdf",
      processingStatus: "queued",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mockDb = {
      select: () => ({
        from: (table: { [key: string]: unknown }) => ({
          where: () => ({
            limit: () => {
              if ("title" in table) {
                const doc = docs.get(docId);
                return Promise.resolve(doc ? [doc] : []);
              }
              if ("storageKey" in table) {
                const file = files.get(docId);
                return Promise.resolve(file ? [file] : []);
              }
              return Promise.resolve([]);
            },
          }),
        }),
      }),
      update: () => ({
        set: (updates: {
          processingStatus?: "queued" | "processing" | "completed" | "failed";
          errorMessage?: string | null;
        }) => ({
          where: () => {
            const doc = docs.get(docId);
            if (doc) Object.assign(doc, updates);
            return Promise.resolve();
          },
        }),
      }),
      insert: () => ({
        values: (val: {
          documentId: string;
          author: string | null;
          rawMetadata: Record<string, unknown> | null;
          extractedAt: Date;
        }) => ({
          onConflictDoUpdate: async () => {
            await metadataRepository.saveMetadata({
              documentId: val.documentId,
              author: val.author,
              rawMetadata: val.rawMetadata,
              extractedAt: val.extractedAt,
            });
          },
        }),
      }),
    };

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
        db: mockDb as unknown as PostgresJsDatabase,
        storage: mockStorage,
      },
    );

    // Document status in DB should now be 'completed'
    expect(docs.get(docId)?.processingStatus).toBe("completed");

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
