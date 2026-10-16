import { describe, expect, test } from "bun:test";
import { createLogger } from "@axentra/observability";
import type { StorageAdapter } from "@axentra/storage";
import {
  apiErrorSchema,
  PREVIEW_URL_TTL_SECONDS,
  previewDocumentSuccessResponseSchema,
} from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { createDocumentService } from "./documents.service";
import { InMemoryPreviewRepository } from "./preview.repository";

const PDF_DOC_ID = "11111111-1111-4111-8111-111111111111";
const DOCX_DOC_ID = "22222222-2222-4222-8222-222222222222";
const NO_FILE_DOC_ID = "33333333-3333-4333-8333-333333333333";
const DELETED_DOC_ID = "44444444-4444-4444-8444-444444444444";
const MISSING_DOC_ID = "99999999-9999-4999-8999-999999999999";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const tokenVerifier: TokenVerifier = {
  verifyToken(token: string) {
    if (token === "member-token") {
      return {
        id: "usr-member-1",
        email: "member@axentra.local",
        role: "member_team",
        name: "Member User",
      };
    }
    if (token === "head-token") {
      return {
        id: "usr-head-1",
        email: "head@axentra.local",
        role: "head_of_team",
        name: "Head User",
      };
    }
    if (token === "admin-token") {
      return {
        id: "usr-admin-1",
        email: "admin@axentra.local",
        role: "admin",
        name: "Admin User",
      };
    }
    return null;
  },
};

const samplePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

function createMockStorage(): StorageAdapter {
  return {
    initialize: async () => {},
    checkHealth: async () => {},
    putObject: async () => {},
    getObject: async (key: string) => {
      if (key === "storage/laporan.pdf") return samplePdfBytes;
      throw new Error("Object not found");
    },
    deleteObject: async () => {},
    headObject: async (key: string) => ({
      key,
      contentLength: samplePdfBytes.byteLength,
      contentType: "application/pdf",
      checksumSha256: undefined,
    }),
    createDownloadUrl: async (key: string, expiresInSeconds = 300) =>
      `https://mock-storage.local/${key}?expires=${expiresInSeconds}&sig=test`,
    close: async () => {},
  };
}

function createSetup(storage?: StorageAdapter) {
  const previewRepository = new InMemoryPreviewRepository();
  const mockStorage = storage ?? createMockStorage();

  previewRepository.setTarget(PDF_DOC_ID, {
    document: { id: PDF_DOC_ID, deletedAt: null },
    file: {
      id: "file-1",
      storageKey: "storage/laporan.pdf",
      originalName: "laporan.pdf",
      mimeType: "application/pdf",
      fileSize: samplePdfBytes.byteLength,
    },
  });

  previewRepository.setTarget(DOCX_DOC_ID, {
    document: { id: DOCX_DOC_ID, deletedAt: null },
    file: {
      id: "file-2",
      storageKey: "storage/kontrak.docx",
      originalName: "kontrak.docx",
      mimeType: DOCX_MIME_TYPE,
      fileSize: 4096,
    },
  });

  previewRepository.setTarget(NO_FILE_DOC_ID, {
    document: { id: NO_FILE_DOC_ID, deletedAt: null },
    file: null,
  });

  previewRepository.setTarget(DELETED_DOC_ID, {
    document: { id: DELETED_DOC_ID, deletedAt: new Date("2026-10-01T00:00:00.000Z") },
    file: {
      id: "file-4",
      storageKey: "storage/laporan.pdf",
      originalName: "deleted.pdf",
      mimeType: "application/pdf",
      fileSize: samplePdfBytes.byteLength,
    },
  });

  const documentService = createDocumentService({
    previewRepository,
    storage: mockStorage,
    logger: testLogger,
  });

  const app = createApp({
    logger: testLogger,
    version: "0.1.0",
    readinessChecks: [],
    tokenVerifier,
    documentService,
  });

  return { app, previewRepository, storage: mockStorage };
}

describe("GET /api/v1/documents/:id/preview — BE-S3-01", () => {
  describe("Authentication", () => {
    test("rejects unauthenticated request with 401", async () => {
      const { app } = createSetup();
      const response = await app.request(`/api/v1/documents/${PDF_DOC_ID}/preview`);

      expect(response.status).toBe(401);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    test("rejects forged or invalid token with 401", async () => {
      const { app } = createSetup();
      const response = await app.request(`/api/v1/documents/${PDF_DOC_ID}/preview`, {
        headers: { authorization: "Bearer invalid-token" },
      });

      expect(response.status).toBe(401);
    });
  });

  describe("Validation", () => {
    test("returns 400 when document id is not a valid UUID", async () => {
      const { app } = createSetup();
      const response = await app.request(`/api/v1/documents/not-a-uuid/preview`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(400);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("ID dokumen harus berupa UUID yang valid");
    });
  });

  describe("Preview payload (AC-08.01)", () => {
    test("allows member_team to preview a PDF with a bounded signed URL", async () => {
      const { app } = createSetup();
      const response = await app.request(`/api/v1/documents/${PDF_DOC_ID}/preview`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(200);
      const body = previewDocumentSuccessResponseSchema.parse(await response.json());
      expect(Object.keys(body.data).sort()).toEqual([
        "expiresInSeconds",
        "fileSize",
        "filename",
        "mimeType",
        "previewUrl",
      ]);
      expect(body.data.filename).toBe("laporan.pdf");
      expect(body.data.mimeType).toBe("application/pdf");
      expect(body.data.fileSize).toBe(samplePdfBytes.byteLength);
      expect(body.data.expiresInSeconds).toBe(PREVIEW_URL_TTL_SECONDS);
      expect(body.data.previewUrl).toContain("storage/laporan.pdf");
      expect(body.data.previewUrl).toContain(`expires=${PREVIEW_URL_TTL_SECONDS}`);
    });

    test("allows head_of_team and admin to preview", async () => {
      const { app } = createSetup();

      const headResponse = await app.request(`/api/v1/documents/${PDF_DOC_ID}/preview`, {
        headers: { authorization: "Bearer head-token" },
      });
      expect(headResponse.status).toBe(200);

      const adminResponse = await app.request(`/api/v1/documents/${PDF_DOC_ID}/preview`, {
        headers: { authorization: "Bearer admin-token" },
      });
      expect(adminResponse.status).toBe(200);
    });

    test("returns preview metadata for DOCX documents", async () => {
      const { app } = createSetup();
      const response = await app.request(`/api/v1/documents/${DOCX_DOC_ID}/preview`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(200);
      const body = previewDocumentSuccessResponseSchema.parse(await response.json());
      expect(body.data.filename).toBe("kontrak.docx");
      expect(body.data.mimeType).toBe(DOCX_MIME_TYPE);
      expect(body.data.previewUrl).toContain("storage/kontrak.docx");
    });
  });

  describe("Document and File Not Found", () => {
    test("returns 404 when document does not exist", async () => {
      const { app } = createSetup();
      const response = await app.request(`/api/v1/documents/${MISSING_DOC_ID}/preview`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(404);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("Dokumen tidak ditemukan");
    });

    test("returns 404 when document is soft-deleted", async () => {
      const { app } = createSetup();
      const response = await app.request(`/api/v1/documents/${DELETED_DOC_ID}/preview`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(404);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("NOT_FOUND");
    });

    test("returns 404 when document has no stored file record", async () => {
      const { app } = createSetup();
      const response = await app.request(`/api/v1/documents/${NO_FILE_DOC_ID}/preview`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(404);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.message).toBe("File dokumen tidak ditemukan");
    });
  });

  describe("Storage failure handling", () => {
    test("returns 500 when the signed preview URL cannot be created", async () => {
      const failingStorage: StorageAdapter = {
        ...createMockStorage(),
        createDownloadUrl: async () => {
          throw new Error("S3 presign failure");
        },
      };
      const { app } = createSetup(failingStorage);
      const response = await app.request(`/api/v1/documents/${PDF_DOC_ID}/preview`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(500);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
