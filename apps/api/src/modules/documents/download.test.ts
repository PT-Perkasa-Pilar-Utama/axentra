import { describe, expect, test } from "bun:test";
import { createLogger } from "@axentra/observability";
import type { StorageAdapter } from "@axentra/storage";
import {
  apiErrorSchema,
  downloadDocumentSuccessResponseSchema,
  DOWNLOAD_ACCESS_DENIED_MESSAGE,
} from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { createDocumentService } from "./documents.service";
import { InMemoryDownloadRepository } from "./download.repository";

const NO_FILE_DOC_ID = "22222222-2222-4222-8222-222222222222";
const UNCATEGORIZED_DOC_ID = "33333333-3333-4333-8333-333333333333";
const DISABLED_CAT_DOC_ID = "44444444-4444-4444-8444-444444444444";
const ENABLED_CAT_DOC_ID = "55555555-5555-4555-8555-555555555555";
const DELETED_DOC_ID = "66666666-6666-4666-8666-666666666666";
const NON_ASCII_DOC_ID = "77777777-7777-4777-8777-777777777777";

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
  const downloadRepo = new InMemoryDownloadRepository();
  const mockStorage = storage ?? createMockStorage();

  // 1. Valid doc with enabled category
  downloadRepo.setTarget(ENABLED_CAT_DOC_ID, {
    document: {
      id: ENABLED_CAT_DOC_ID,
      title: "Laporan Keuangan",
      categoryId: "cat-reporting-1",
      processingStatus: "completed",
      deletedAt: null,
    },
    file: {
      id: "file-1",
      storageKey: "storage/laporan.pdf",
      originalName: "laporan.pdf",
      mimeType: "application/pdf",
      fileSize: samplePdfBytes.byteLength,
      fileExtension: "pdf",
    },
    categoryPermission: {
      downloadEnabled: true,
    },
  });

  // 2. Valid doc with disabled category
  downloadRepo.setTarget(DISABLED_CAT_DOC_ID, {
    document: {
      id: DISABLED_CAT_DOC_ID,
      title: "Dokumen Rahasia",
      categoryId: "cat-secret-1",
      processingStatus: "completed",
      deletedAt: null,
    },
    file: {
      id: "file-2",
      storageKey: "storage/laporan.pdf",
      originalName: "rahasia.pdf",
      mimeType: "application/pdf",
      fileSize: samplePdfBytes.byteLength,
      fileExtension: "pdf",
    },
    categoryPermission: {
      downloadEnabled: false,
    },
  });

  // 3. Uncategorized doc
  downloadRepo.setTarget(UNCATEGORIZED_DOC_ID, {
    document: {
      id: UNCATEGORIZED_DOC_ID,
      title: "Dokumen Tanpa Kategori",
      categoryId: null,
      processingStatus: "completed",
      deletedAt: null,
    },
    file: {
      id: "file-3",
      storageKey: "storage/laporan.pdf",
      originalName: "uncategorized.pdf",
      mimeType: "application/pdf",
      fileSize: samplePdfBytes.byteLength,
      fileExtension: "pdf",
    },
    categoryPermission: null,
  });

  // 4. Doc without file
  downloadRepo.setTarget(NO_FILE_DOC_ID, {
    document: {
      id: NO_FILE_DOC_ID,
      title: "Dokumen Hilang",
      categoryId: "cat-reporting-1",
      processingStatus: "failed",
      deletedAt: null,
    },
    file: null,
    categoryPermission: {
      downloadEnabled: true,
    },
  });

  // 5. Soft-deleted doc
  downloadRepo.setTarget(DELETED_DOC_ID, {
    document: {
      id: DELETED_DOC_ID,
      title: "Dokumen Terhapus",
      categoryId: "cat-reporting-1",
      processingStatus: "completed",
      deletedAt: new Date("2026-10-01T00:00:00.000Z"),
    },
    file: {
      id: "file-5",
      storageKey: "storage/laporan.pdf",
      originalName: "deleted.pdf",
      mimeType: "application/pdf",
      fileSize: samplePdfBytes.byteLength,
      fileExtension: "pdf",
    },
    categoryPermission: {
      downloadEnabled: true,
    },
  });

  // 6. Valid doc with non-ASCII filename (F1)
  downloadRepo.setTarget(NON_ASCII_DOC_ID, {
    document: {
      id: NON_ASCII_DOC_ID,
      title: "Laporan – Q3",
      categoryId: "cat-reporting-1",
      processingStatus: "completed",
      deletedAt: null,
    },
    file: {
      id: "file-6",
      storageKey: "storage/laporan.pdf",
      originalName: "Laporan – Q3 (中文 & 日本語).pdf",
      mimeType: "application/pdf",
      fileSize: samplePdfBytes.byteLength,
      fileExtension: "pdf",
    },
    categoryPermission: {
      downloadEnabled: true,
    },
  });

  const documentService = createDocumentService({
    downloadRepository: downloadRepo,
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

  return { app, downloadRepo, storage: mockStorage };
}

describe("GET /api/v1/documents/:id/download — BE-S3-02", () => {
  describe("Authentication and Route Gating", () => {
    test("rejects unauthenticated request with 401", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request(`/api/v1/documents/${ENABLED_CAT_DOC_ID}/download`);

      expect(response.status).toBe(401);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(downloadRepo.getRecordedAuditEvents().length).toBe(0);
    });

    test("rejects forged or invalid token with 401", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request(`/api/v1/documents/${ENABLED_CAT_DOC_ID}/download`, {
        headers: { authorization: "Bearer invalid-token" },
      });

      expect(response.status).toBe(401);
      expect(downloadRepo.getRecordedAuditEvents().length).toBe(0);
    });
  });

  describe("Validation", () => {
    test("returns 400 when document id is not a valid UUID", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request(`/api/v1/documents/not-a-uuid/download`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(400);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(downloadRepo.getRecordedAuditEvents().length).toBe(0);
    });

    test("returns 400 with Indonesian message when expiresInSeconds is invalid or outside bounds [60, 900] (F2)", async () => {
      const { app, downloadRepo } = createSetup();
      const responseLow = await app.request(
        `/api/v1/documents/${ENABLED_CAT_DOC_ID}/download?expiresInSeconds=30`,
        { headers: { authorization: "Bearer member-token" } },
      );
      expect(responseLow.status).toBe(400);
      const lowBody = apiErrorSchema.parse(await responseLow.json());
      expect(lowBody.error.message).toBe("Masa berlaku URL minimal 60 detik");

      const responseHigh = await app.request(
        `/api/v1/documents/${ENABLED_CAT_DOC_ID}/download?expiresInSeconds=1000`,
        { headers: { authorization: "Bearer member-token" } },
      );
      expect(responseHigh.status).toBe(400);
      const highBody = apiErrorSchema.parse(await responseHigh.json());
      expect(highBody.error.message).toBe("Masa berlaku URL maksimal 900 detik");

      const responseNaN = await app.request(
        `/api/v1/documents/${ENABLED_CAT_DOC_ID}/download?expiresInSeconds=abc`,
        { headers: { authorization: "Bearer member-token" } },
      );
      expect(responseNaN.status).toBe(400);
      const nanBody = apiErrorSchema.parse(await responseNaN.json());
      expect(nanBody.error.message).toBe("Masa berlaku URL harus berupa angka");

      expect(downloadRepo.getRecordedAuditEvents().length).toBe(0);
    });
  });

  describe("Document and File Not Found", () => {
    test("returns 404 when document does not exist", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request(
        `/api/v1/documents/99999999-9999-4999-8999-999999999999/download`,
        { headers: { authorization: "Bearer member-token" } },
      );

      expect(response.status).toBe(404);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("NOT_FOUND");
      expect(downloadRepo.getRecordedAuditEvents().length).toBe(0);
    });

    test("returns 404 when document is soft-deleted", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request(`/api/v1/documents/${DELETED_DOC_ID}/download`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(404);
      expect(downloadRepo.getRecordedAuditEvents().length).toBe(0);
    });

    test("returns 404 when document has no stored file record", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request(`/api/v1/documents/${NO_FILE_DOC_ID}/download`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(404);
      expect(downloadRepo.getRecordedAuditEvents().length).toBe(0);
    });
  });

  describe("Category Download Permission Checks (AC-09.01, AC-13.01)", () => {
    test("rejects member_team with 403 when category download permission is disabled", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request(`/api/v1/documents/${DISABLED_CAT_DOC_ID}/download`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(403);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toBe(DOWNLOAD_ACCESS_DENIED_MESSAGE);
      expect(downloadRepo.getRecordedAuditEvents().length).toBe(0);
    });

    test("rejects member_team with 403 when document is uncategorized", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request(`/api/v1/documents/${UNCATEGORIZED_DOC_ID}/download`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(403);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toBe(DOWNLOAD_ACCESS_DENIED_MESSAGE);
      expect(downloadRepo.getRecordedAuditEvents().length).toBe(0);
    });

    test("allows member_team to download when category download permission is active", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request(`/api/v1/documents/${ENABLED_CAT_DOC_ID}/download`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(200);
      const body = downloadDocumentSuccessResponseSchema.parse(await response.json());
      expect(body.data.filename).toBe("laporan.pdf");
      expect(body.data.downloadUrl).toContain("storage/laporan.pdf");
      expect(body.data.expiresInSeconds).toBe(300);

      // Verify audit event was written
      const auditEvents = downloadRepo.getRecordedAuditEvents();
      expect(auditEvents.length).toBe(1);
      expect(auditEvents[0]?.userId).toBe("usr-member-1");
      expect(auditEvents[0]?.userName).toBe("Member User");
      expect(auditEvents[0]?.userEmail).toBe("member@axentra.local");
      expect(auditEvents[0]?.documentId).toBe(ENABLED_CAT_DOC_ID);
      expect(auditEvents[0]?.documentName).toBe("laporan.pdf");
      expect(auditEvents[0]?.downloadedAt).toBeDefined();
    });

    test("allows head_of_team to download even if category download permission is disabled", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request(`/api/v1/documents/${DISABLED_CAT_DOC_ID}/download`, {
        headers: { authorization: "Bearer head-token" },
      });

      expect(response.status).toBe(200);
      const body = downloadDocumentSuccessResponseSchema.parse(await response.json());
      expect(body.data.filename).toBe("rahasia.pdf");

      const auditEvents = downloadRepo.getRecordedAuditEvents();
      expect(auditEvents.length).toBe(1);
      expect(auditEvents[0]?.userId).toBe("usr-head-1");
      expect(auditEvents[0]?.userName).toBe("Head User");
      expect(auditEvents[0]?.documentId).toBe(DISABLED_CAT_DOC_ID);
    });

    test("allows admin to download even if category download permission is disabled", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request(`/api/v1/documents/${DISABLED_CAT_DOC_ID}/download`, {
        headers: { authorization: "Bearer admin-token" },
      });

      expect(response.status).toBe(200);
      const body = downloadDocumentSuccessResponseSchema.parse(await response.json());
      expect(body.data.filename).toBe("rahasia.pdf");

      const auditEvents = downloadRepo.getRecordedAuditEvents();
      expect(auditEvents.length).toBe(1);
      expect(auditEvents[0]?.userId).toBe("usr-admin-1");
      expect(auditEvents[0]?.userName).toBe("Admin User");
    });
  });

  describe("Delivery Modes (Signed URL vs File Streaming)", () => {
    test("returns bounded signed URL with custom valid expiry", async () => {
      const { app } = createSetup();
      const response = await app.request(
        `/api/v1/documents/${ENABLED_CAT_DOC_ID}/download?expiresInSeconds=600`,
        { headers: { authorization: "Bearer member-token" } },
      );

      expect(response.status).toBe(200);
      const body = downloadDocumentSuccessResponseSchema.parse(await response.json());
      expect(body.data.expiresInSeconds).toBe(600);
      expect(body.data.downloadUrl).toContain("expires=600");
    });

    test("streams file content directly when ?stream=true", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request(
        `/api/v1/documents/${ENABLED_CAT_DOC_ID}/download?stream=true`,
        { headers: { authorization: "Bearer member-token" } },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-disposition")).toContain(
        'attachment; filename="laporan.pdf"',
      );
      expect(response.headers.get("content-length")).toBe(samplePdfBytes.byteLength.toString());

      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(bytes).toEqual(samplePdfBytes);

      // Verify audit was recorded
      expect(downloadRepo.getRecordedAuditEvents().length).toBe(1);
    });

    test("streams file content directly when Accept: application/octet-stream", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request(`/api/v1/documents/${ENABLED_CAT_DOC_ID}/download`, {
        headers: {
          authorization: "Bearer member-token",
          accept: "application/octet-stream",
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-disposition")).toContain(
        'attachment; filename="laporan.pdf"',
      );

      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(bytes).toEqual(samplePdfBytes);
      expect(downloadRepo.getRecordedAuditEvents().length).toBe(1);
    });

    test("streams non-ASCII filename without 500 and with ASCII-safe Content-Disposition fallback (F1)", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request(
        `/api/v1/documents/${NON_ASCII_DOC_ID}/download?stream=true`,
        { headers: { authorization: "Bearer member-token" } },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      const contentDisposition = response.headers.get("content-disposition");
      expect(contentDisposition).not.toBeNull();
      // ASCII fallback uses sanitizeFilename (replaces non-ASCII characters with _)
      expect(contentDisposition).toContain('filename="Laporan___Q3___________.pdf"');
      // UTF-8 filename* retains full Unicode filename per RFC 5987 / 6266
      expect(contentDisposition).toContain(
        `filename*=UTF-8''${encodeURIComponent("Laporan – Q3 (中文 & 日本語).pdf")}`,
      );

      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(bytes).toEqual(samplePdfBytes);
      expect(downloadRepo.getRecordedAuditEvents().length).toBe(1);
    });
  });

  describe("Storage Failure Handling (F3 & F7)", () => {
    test("does not record audit event when getObject throws in stream mode", async () => {
      const failingStorage: StorageAdapter = {
        ...createMockStorage(),
        getObject: async () => {
          throw new Error("S3 read failure");
        },
      };
      const { app, downloadRepo } = createSetup(failingStorage);
      const response = await app.request(
        `/api/v1/documents/${ENABLED_CAT_DOC_ID}/download?stream=true`,
        { headers: { authorization: "Bearer member-token" } },
      );

      expect(response.status).toBe(500);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(downloadRepo.getRecordedAuditEvents().length).toBe(0);
    });

    test("does not record audit event when createDownloadUrl throws in signed URL mode", async () => {
      const failingStorage: StorageAdapter = {
        ...createMockStorage(),
        createDownloadUrl: async () => {
          throw new Error("S3 presign failure");
        },
      };
      const { app, downloadRepo } = createSetup(failingStorage);
      const response = await app.request(`/api/v1/documents/${ENABLED_CAT_DOC_ID}/download`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(500);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(downloadRepo.getRecordedAuditEvents().length).toBe(0);
    });
  });
});
