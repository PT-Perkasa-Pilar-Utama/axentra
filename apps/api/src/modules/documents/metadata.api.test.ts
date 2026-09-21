import { describe, expect, it } from "bun:test";
import { createLogger } from "@axentra/observability";
import type { ApiErrorEnvelope, ApiSuccessEnvelope, DocumentMetadataResult } from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { createDocumentService } from "./documents.service";
import { InMemoryDocumentMetadataRepository } from "./metadata.repository";
import { DeterministicMetadataExtractor } from "./metadata.extractor";

const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const memberTokenVerifier: TokenVerifier = {
  verifyToken(token: string) {
    if (token === "valid-member-token") {
      return {
        id: "usr-member-1",
        email: "member@axentra.local",
        role: "member_team",
        name: "Member User",
      };
    }
    if (token === "valid-head-token") {
      return {
        id: "usr-head-1",
        email: "head@axentra.local",
        role: "head_of_team",
        name: "Head of Team User",
      };
    }
    return null;
  },
};

describe("GET /api/v1/documents/:id/metadata - Task BE-S1-05 (AC-03.01)", () => {
  const repository = new InMemoryDocumentMetadataRepository();
  const extractor = new DeterministicMetadataExtractor();
  const documentService = createDocumentService({
    metadataRepository: repository,
    metadataExtractor: extractor,
  });

  const app = createApp({
    logger: testLogger,
    version: "0.1.0",
    readinessChecks: [],
    tokenVerifier: memberTokenVerifier,
    documentService,
  });

  const existingDocId = "11111111-1111-4111-8111-111111111111";
  const docWithoutMetadataId = "22222222-2222-4222-8222-222222222222";
  const nonExistentDocId = "99999999-9999-4999-8999-999999999999";

  // Setup test documents in repository
  repository.addDocument({
    id: existingDocId,
    title: "Laporan Tahunan 2026.pdf",
    processingStatus: "completed",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  repository.addDocument({
    id: docWithoutMetadataId,
    title: "Laporan Sedang Diproses.pdf",
    processingStatus: "processing",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Seed metadata for existingDocId
  repository.saveMetadata({
    documentId: existingDocId,
    author: "Arya Isnaidi",
    rawMetadata: {
      extractor: "deterministic-placeholder",
      method: "pdf_info_dict",
    },
    extractedAt: new Date("2026-09-21T05:00:00.000Z"),
  });

  describe("Authentication & RBAC", () => {
    it("rejects unauthenticated request with 401 Unauthorized", async () => {
      const response = await app.request(`/api/v1/documents/${existingDocId}/metadata`, {
        method: "GET",
      });

      expect(response.status).toBe(401);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects invalid Bearer token with 401 Unauthorized", async () => {
      const response = await app.request(`/api/v1/documents/${existingDocId}/metadata`, {
        method: "GET",
        headers: {
          authorization: "Bearer invalid-token",
        },
      });

      expect(response.status).toBe(401);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("allows member_team to retrieve document metadata", async () => {
      const response = await app.request(`/api/v1/documents/${existingDocId}/metadata`, {
        method: "GET",
        headers: {
          authorization: "Bearer valid-member-token",
        },
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as ApiSuccessEnvelope<DocumentMetadataResult>;
      expect(json.success).toBe(true);
      expect(json.data.author).toBe("Arya Isnaidi");
    });

    it("allows head_of_team to retrieve document metadata", async () => {
      const response = await app.request(`/api/v1/documents/${existingDocId}/metadata`, {
        method: "GET",
        headers: {
          authorization: "Bearer valid-head-token",
        },
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as ApiSuccessEnvelope<DocumentMetadataResult>;
      expect(json.success).toBe(true);
      expect(json.data.author).toBe("Arya Isnaidi");
    });
  });

  describe("Input Validation", () => {
    it("rejects non-UUID document ID with 400 Bad Request", async () => {
      const response = await app.request("/api/v1/documents/not-a-valid-uuid/metadata", {
        method: "GET",
        headers: {
          authorization: "Bearer valid-member-token",
        },
      });

      expect(response.status).toBe(400);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("VALIDATION_ERROR");
      expect(json.error.message).toBe("ID dokumen harus berupa UUID yang valid");
    });
  });

  describe("Resource Not Found Handling", () => {
    it("returns 404 Not Found when document does not exist", async () => {
      const response = await app.request(`/api/v1/documents/${nonExistentDocId}/metadata`, {
        method: "GET",
        headers: {
          authorization: "Bearer valid-member-token",
        },
      });

      expect(response.status).toBe(404);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("NOT_FOUND");
      expect(json.error.message).toBe("Dokumen tidak ditemukan");
    });

    it("returns 404 Not Found when document exists but metadata is not yet extracted", async () => {
      const response = await app.request(`/api/v1/documents/${docWithoutMetadataId}/metadata`, {
        method: "GET",
        headers: {
          authorization: "Bearer valid-member-token",
        },
      });

      expect(response.status).toBe(404);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("NOT_FOUND");
      expect(json.error.message).toBe("Metadata dokumen tidak ditemukan");
    });
  });

  describe("AC-03.01: Extracted Author Metadata Response", () => {
    it("returns correct author name and standard response envelope", async () => {
      const response = await app.request(`/api/v1/documents/${existingDocId}/metadata`, {
        method: "GET",
        headers: {
          authorization: "Bearer valid-member-token",
        },
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as ApiSuccessEnvelope<DocumentMetadataResult>;
      expect(json.success).toBe(true);
      expect(json.data.documentId).toBe(existingDocId);
      expect(json.data.author).toBe("Arya Isnaidi");
      expect(json.data.extractedAt).toBe("2026-09-21T05:00:00.000Z");
      expect(json.data.rawMetadata).toBeDefined();
      expect(json.data.createdAt).toBeDefined();
      expect(json.data.updatedAt).toBeDefined();
    });

    it("extracts and stores author from document content, then returns it via API", async () => {
      const newDocId = "33333333-3333-4333-8333-333333333333";
      repository.addDocument({
        id: newDocId,
        title: "Laporan Riset.pdf",
        processingStatus: "queued",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Simulate extraction via service with PDF buffer containing /Author
      const pdfBytes = Buffer.from(
        "%PDF-1.4\n1 0 obj\n<< /Title (Laporan Riset) /Author (Prof. Sumitro) >>\nendobj\n%%EOF",
      );
      await documentService.extractAndStoreMetadata(newDocId, {
        filename: "Laporan Riset.pdf",
        mimeType: "application/pdf",
        buffer: pdfBytes,
      });

      // Now query the API endpoint
      const response = await app.request(`/api/v1/documents/${newDocId}/metadata`, {
        method: "GET",
        headers: {
          authorization: "Bearer valid-member-token",
        },
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as ApiSuccessEnvelope<DocumentMetadataResult>;
      expect(json.success).toBe(true);
      expect(json.data.documentId).toBe(newDocId);
      expect(json.data.author).toBe("Prof. Sumitro");
      expect(json.data.rawMetadata?.extractor).toBe("deterministic-placeholder");
    });
  });
});
