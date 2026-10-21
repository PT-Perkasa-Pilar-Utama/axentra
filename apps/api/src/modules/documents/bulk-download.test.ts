import { describe, expect, test } from "bun:test";
import { createLogger } from "@axentra/observability";
import type { StorageAdapter } from "@axentra/storage";
import {
  apiErrorSchema,
  BULK_DOWNLOAD_MAX_TOTAL_BYTES,
  DOWNLOAD_ACCESS_DENIED_MESSAGE,
} from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { createDocumentService } from "./documents.service";
import { InMemoryDownloadRepository, type IDownloadRepository } from "./download.repository";
import { parseZipEntryNames } from "./documents.schema";

const ENABLED_DOC_1 = "11111111-1111-4111-8111-111111111111";
const ENABLED_DOC_2 = "22222222-2222-4222-8222-222222222222";
const ENABLED_DOC_SAME_NAME = "33333333-3333-4333-8333-333333333333";
const DISABLED_DOC = "44444444-4444-4444-8444-444444444444";
const UNCATEGORIZED_DOC = "55555555-5555-4555-8555-555555555555";
const NO_FILE_DOC = "66666666-6666-4666-8666-666666666666";
const DELETED_DOC = "77777777-7777-4777-8777-777777777777";
const NON_EXISTENT_DOC = "88888888-8888-4888-8888-888888888888";
const TRAVERSAL_DOC = "99999999-9999-4999-8999-999999999999";
const OVERSIZED_DOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

const pdfBytes1 = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const docxBytes2 = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const pdfBytes3 = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x32]);

function createMockStorage(): StorageAdapter {
  return {
    initialize: async () => {},
    checkHealth: async () => {},
    putObject: async () => {},
    getObject: async (key: string) => {
      if (key === "storage/doc1.pdf") return pdfBytes1;
      if (key === "storage/doc2.docx") return docxBytes2;
      if (key === "storage/doc3.pdf") return pdfBytes3;
      if (key === "storage/traversal.pdf") return pdfBytes1;
      throw new Error(`Object not found for key: ${key}`);
    },
    deleteObject: async () => {},
    headObject: async (key: string) => ({
      key,
      contentLength: 100,
      contentType: "application/octet-stream",
      checksumSha256: undefined,
    }),
    createDownloadUrl: async (key: string) => `https://mock-storage.local/${key}`,
    close: async () => {},
  };
}

function createSetup(storage?: StorageAdapter) {
  const downloadRepo = new InMemoryDownloadRepository();
  const mockStorage = storage ?? createMockStorage();

  // 1. Doc 1 - enabled category
  downloadRepo.setTarget(ENABLED_DOC_1, {
    document: {
      id: ENABLED_DOC_1,
      title: "Laporan Q1",
      categoryId: "cat-reporting-1",
      processingStatus: "completed",
      deletedAt: null,
    },
    file: {
      id: "file-1",
      storageKey: "storage/doc1.pdf",
      originalName: "laporan.pdf",
      mimeType: "application/pdf",
      fileSize: pdfBytes1.byteLength,
      fileExtension: "pdf",
    },
    categoryPermission: { downloadEnabled: true },
  });

  // 2. Doc 2 - enabled category
  downloadRepo.setTarget(ENABLED_DOC_2, {
    document: {
      id: ENABLED_DOC_2,
      title: "Kontrak Vendor",
      categoryId: "cat-contracts-1",
      processingStatus: "completed",
      deletedAt: null,
    },
    file: {
      id: "file-2",
      storageKey: "storage/doc2.docx",
      originalName: "kontrak.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileSize: docxBytes2.byteLength,
      fileExtension: "docx",
    },
    categoryPermission: { downloadEnabled: true },
  });

  // 3. Doc 3 - enabled category, but identical originalName "laporan.pdf"
  downloadRepo.setTarget(ENABLED_DOC_SAME_NAME, {
    document: {
      id: ENABLED_DOC_SAME_NAME,
      title: "Laporan Q2",
      categoryId: "cat-reporting-1",
      processingStatus: "completed",
      deletedAt: null,
    },
    file: {
      id: "file-3",
      storageKey: "storage/doc3.pdf",
      originalName: "laporan.pdf",
      mimeType: "application/pdf",
      fileSize: pdfBytes3.byteLength,
      fileExtension: "pdf",
    },
    categoryPermission: { downloadEnabled: true },
  });

  // 4. Doc 4 - disabled category
  downloadRepo.setTarget(DISABLED_DOC, {
    document: {
      id: DISABLED_DOC,
      title: "Dokumen Rahasia",
      categoryId: "cat-secret-1",
      processingStatus: "completed",
      deletedAt: null,
    },
    file: {
      id: "file-4",
      storageKey: "storage/doc1.pdf",
      originalName: "rahasia.pdf",
      mimeType: "application/pdf",
      fileSize: pdfBytes1.byteLength,
      fileExtension: "pdf",
    },
    categoryPermission: { downloadEnabled: false },
  });

  // 5. Doc 5 - uncategorized
  downloadRepo.setTarget(UNCATEGORIZED_DOC, {
    document: {
      id: UNCATEGORIZED_DOC,
      title: "Dokumen Tanpa Kategori",
      categoryId: null,
      processingStatus: "completed",
      deletedAt: null,
    },
    file: {
      id: "file-5",
      storageKey: "storage/doc1.pdf",
      originalName: "uncategorized.pdf",
      mimeType: "application/pdf",
      fileSize: pdfBytes1.byteLength,
      fileExtension: "pdf",
    },
    categoryPermission: null,
  });

  // 6. Doc 6 - no file record
  downloadRepo.setTarget(NO_FILE_DOC, {
    document: {
      id: NO_FILE_DOC,
      title: "Dokumen Gagal",
      categoryId: "cat-reporting-1",
      processingStatus: "failed",
      deletedAt: null,
    },
    file: null,
    categoryPermission: { downloadEnabled: true },
  });

  // 7. Doc 7 - soft-deleted
  downloadRepo.setTarget(DELETED_DOC, {
    document: {
      id: DELETED_DOC,
      title: "Dokumen Terhapus",
      categoryId: "cat-reporting-1",
      processingStatus: "completed",
      deletedAt: new Date("2026-10-01T00:00:00.000Z"),
    },
    file: {
      id: "file-7",
      storageKey: "storage/doc1.pdf",
      originalName: "deleted.pdf",
      mimeType: "application/pdf",
      fileSize: pdfBytes1.byteLength,
      fileExtension: "pdf",
    },
    categoryPermission: { downloadEnabled: true },
  });

  // 8. Doc 8 - path traversal filename in database (F1)
  downloadRepo.setTarget(TRAVERSAL_DOC, {
    document: {
      id: TRAVERSAL_DOC,
      title: "Dokumen Traversal",
      categoryId: "cat-reporting-1",
      processingStatus: "completed",
      deletedAt: null,
    },
    file: {
      id: "file-8",
      storageKey: "storage/traversal.pdf",
      originalName: "../../outside.pdf",
      mimeType: "application/pdf",
      fileSize: pdfBytes1.byteLength,
      fileExtension: "pdf",
    },
    categoryPermission: { downloadEnabled: true },
  });

  // 9. Doc 9 - oversized document exceeding 250 MB (F2)
  downloadRepo.setTarget(OVERSIZED_DOC, {
    document: {
      id: OVERSIZED_DOC,
      title: "Dokumen Raksasa",
      categoryId: "cat-reporting-1",
      processingStatus: "completed",
      deletedAt: null,
    },
    file: {
      id: "file-9",
      storageKey: "storage/oversized.pdf",
      originalName: "raksasa.pdf",
      mimeType: "application/pdf",
      fileSize: BULK_DOWNLOAD_MAX_TOTAL_BYTES + 1024,
      fileExtension: "pdf",
    },
    categoryPermission: { downloadEnabled: true },
  });

  const documentService = createDocumentService({
    storage: mockStorage,
    downloadRepository: downloadRepo,
    logger: testLogger,
  });

  const app = createApp({
    documentService,
    tokenVerifier,
    logger: testLogger,
    version: "0.1.0",
    readinessChecks: [],
  });

  return { app, downloadRepo, mockStorage };
}

describe("POST /api/v1/documents/bulk-download — BE-S3-03", () => {
  describe("Authentication and Route Gating", () => {
    test("rejects unauthenticated request with 401", async () => {
      const { app } = createSetup();
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: [ENABLED_DOC_1] }),
      });

      expect(response.status).toBe(401);
      const json = await response.json();
      const parsed = apiErrorSchema.safeParse(json);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.error.code).toBe("UNAUTHORIZED");
    });

    test("rejects forged or invalid token with 401", async () => {
      const { app } = createSetup();
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer invalid-or-forged-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [ENABLED_DOC_1] }),
      });

      expect(response.status).toBe(401);
      const json = await response.json();
      const parsed = apiErrorSchema.safeParse(json);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("Validation", () => {
    test("returns 400 when body is not valid JSON or missing documentIds", async () => {
      const { app } = createSetup();
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: "invalid-json",
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      const parsed = apiErrorSchema.safeParse(json);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.error.code).toBe("VALIDATION_ERROR");
    });

    test("returns 400 when documentIds array is empty", async () => {
      const { app } = createSetup();
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [] }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      const parsed = apiErrorSchema.safeParse(json);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.error.code).toBe("VALIDATION_ERROR");
      expect(parsed.data?.error.message).toBe("Minimal satu dokumen harus dipilih");
    });

    test("returns 400 when documentIds contains invalid UUID", async () => {
      const { app } = createSetup();
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: ["not-a-uuid"] }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      const parsed = apiErrorSchema.safeParse(json);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.error.code).toBe("VALIDATION_ERROR");
      expect(parsed.data?.error.message).toBe("ID dokumen harus berupa UUID yang valid");
    });
  });

  describe("Document and File Not Found", () => {
    test("returns 404 when one or more documents do not exist", async () => {
      const { app } = createSetup();
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [ENABLED_DOC_1, NON_EXISTENT_DOC] }),
      });

      expect(response.status).toBe(404);
      const json = await response.json();
      const parsed = apiErrorSchema.safeParse(json);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.error.code).toBe("NOT_FOUND");
      expect(parsed.data?.error.message).toBe("Dokumen tidak ditemukan");
    });

    test("returns 404 when one or more documents are soft-deleted", async () => {
      const { app } = createSetup();
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [ENABLED_DOC_1, DELETED_DOC] }),
      });

      expect(response.status).toBe(404);
      const json = await response.json();
      const parsed = apiErrorSchema.safeParse(json);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.error.code).toBe("NOT_FOUND");
      expect(parsed.data?.error.message).toBe("Dokumen tidak ditemukan");
    });

    test("returns 404 when a document has no stored file record", async () => {
      const { app } = createSetup();
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [ENABLED_DOC_1, NO_FILE_DOC] }),
      });

      expect(response.status).toBe(404);
      const json = await response.json();
      const parsed = apiErrorSchema.safeParse(json);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.error.code).toBe("NOT_FOUND");
      expect(parsed.data?.error.message).toBe("File dokumen tidak ditemukan");
    });
  });

  describe("Category Permission Enforcement per item (AC-10.01, AC-13.01)", () => {
    test("rejects member_team with 403 when any requested document has disabled category permission", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [ENABLED_DOC_1, DISABLED_DOC] }),
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      const parsed = apiErrorSchema.safeParse(json);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.error.code).toBe("FORBIDDEN");
      expect(parsed.data?.error.message).toBe(DOWNLOAD_ACCESS_DENIED_MESSAGE);
      expect(downloadRepo.getRecordedAuditEvents()).toHaveLength(0);
    });

    test("rejects member_team with 403 when any requested document is uncategorized", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [ENABLED_DOC_1, UNCATEGORIZED_DOC] }),
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      const parsed = apiErrorSchema.safeParse(json);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.error.code).toBe("FORBIDDEN");
      expect(parsed.data?.error.message).toBe(DOWNLOAD_ACCESS_DENIED_MESSAGE);
      expect(downloadRepo.getRecordedAuditEvents()).toHaveLength(0);
    });

    test("allows member_team when all requested documents have active category permission", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [ENABLED_DOC_1, ENABLED_DOC_2] }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/zip");
      expect(response.headers.get("Content-Disposition")).toContain(
        'filename="axentra-documents.zip"',
      );

      const arrayBuffer = await response.arrayBuffer();
      const zipBytes = new Uint8Array(arrayBuffer);
      const entryNames = parseZipEntryNames(zipBytes);

      expect(entryNames.size).toBe(2);
      expect(entryNames.has("laporan.pdf")).toBe(true);
      expect(entryNames.has("kontrak.docx")).toBe(true);

      // Verify audit events recorded for all items
      const auditEvents = downloadRepo.getRecordedAuditEvents();
      expect(auditEvents).toHaveLength(2);
      expect(auditEvents.map((e) => e.documentId)).toEqual([ENABLED_DOC_1, ENABLED_DOC_2]);
    });

    test("allows head_of_team to download documents even if category permission is disabled or uncategorized", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer head-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [ENABLED_DOC_1, DISABLED_DOC, UNCATEGORIZED_DOC] }),
      });

      expect(response.status).toBe(200);
      const zipBytes = new Uint8Array(await response.arrayBuffer());
      const entryNames = parseZipEntryNames(zipBytes);
      expect(entryNames.size).toBe(3);

      const auditEvents = downloadRepo.getRecordedAuditEvents();
      expect(auditEvents).toHaveLength(3);
      expect(auditEvents[0]?.userName).toBe("Head User");
    });

    test("allows admin to download documents even if category permission is disabled", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [DISABLED_DOC] }),
      });

      expect(response.status).toBe(200);
      const auditEvents = downloadRepo.getRecordedAuditEvents();
      expect(auditEvents).toHaveLength(1);
      expect(auditEvents[0]?.userEmail).toBe("admin@axentra.local");
    });
  });

  describe("ZIP Archive Structure & Filename Collision Handling", () => {
    test("deduplicates collision filenames in zip entries without error", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [ENABLED_DOC_1, ENABLED_DOC_SAME_NAME] }),
      });

      expect(response.status).toBe(200);
      const zipBytes = new Uint8Array(await response.arrayBuffer());
      const entryNames = parseZipEntryNames(zipBytes);

      expect(entryNames.size).toBe(2);
      expect(entryNames.has("laporan.pdf")).toBe(true);
      expect(entryNames.has("laporan (1).pdf")).toBe(true);

      const auditEvents = downloadRepo.getRecordedAuditEvents();
      expect(auditEvents).toHaveLength(2);
    });

    test("deduplicates redundant document IDs in request payload", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [ENABLED_DOC_1, ENABLED_DOC_1] }),
      });

      expect(response.status).toBe(200);
      const zipBytes = new Uint8Array(await response.arrayBuffer());
      const entryNames = parseZipEntryNames(zipBytes);

      expect(entryNames.size).toBe(1);
      expect(entryNames.has("laporan.pdf")).toBe(true);

      const auditEvents = downloadRepo.getRecordedAuditEvents();
      expect(auditEvents).toHaveLength(1);
    });

    test("sanitizes path traversal filenames in zip entries without writing outside (F1)", async () => {
      const { app, downloadRepo } = createSetup();
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [TRAVERSAL_DOC] }),
      });

      expect(response.status).toBe(200);
      const zipBytes = new Uint8Array(await response.arrayBuffer());
      const entryNames = parseZipEntryNames(zipBytes);

      expect(entryNames.size).toBe(1);
      expect(entryNames.has("outside.pdf")).toBe(true);
      expect(entryNames.has("../../outside.pdf")).toBe(false);

      const auditEvents = downloadRepo.getRecordedAuditEvents();
      expect(auditEvents).toHaveLength(1);
    });
  });

  describe("Resource Limits & Aggregate Payload Size (F2)", () => {
    test("returns 413 PAYLOAD_TOO_LARGE when total document size exceeds 250 MB before storage retrieval", async () => {
      let getObjectCalled = false;
      const trackingStorage: StorageAdapter = {
        ...createMockStorage(),
        getObject: async () => {
          getObjectCalled = true;
          return pdfBytes1;
        },
      };

      const { app, downloadRepo } = createSetup(trackingStorage);
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [OVERSIZED_DOC] }),
      });

      expect(response.status).toBe(413);
      const json = await response.json();
      const parsed = apiErrorSchema.safeParse(json);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.error.code).toBe("PAYLOAD_TOO_LARGE");
      expect(parsed.data?.error.message).toContain("250 MB");
      // Storage retrieval was never triggered
      expect(getObjectCalled).toBe(false);
      // No audit events written
      expect(downloadRepo.getRecordedAuditEvents()).toHaveLength(0);
    });
  });

  describe("Atomic Category Permission Recheck & Audit (F3)", () => {
    test("rejects request with 403 when category permission is revoked midway during operation", async () => {
      const setup = createSetup();

      // Simulate concurrent revocation right before atomic checkCategoryPermissions executes
      const originalCheck = setup.downloadRepo.checkCategoryPermissions.bind(setup.downloadRepo);
      setup.downloadRepo.checkCategoryPermissions = async (ids, opts) => {
        const target = setup.downloadRepo.getTarget(ENABLED_DOC_1);
        if (target) {
          target.categoryPermission = { downloadEnabled: false };
        }
        return originalCheck(ids, opts);
      };

      const response = await setup.app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [ENABLED_DOC_1] }),
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      const parsed = apiErrorSchema.safeParse(json);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.error.code).toBe("FORBIDDEN");
      expect(parsed.data?.error.message).toBe(DOWNLOAD_ACCESS_DENIED_MESSAGE);
      // Zero audit events recorded because atomic recheck aborted
      expect(setup.downloadRepo.getRecordedAuditEvents()).toHaveLength(0);
    });
  });

  describe("ZIP32 Limits & Guards (F2)", () => {
    test("throws PayloadTooLargeError when single document size exceeds 4 GiB", async () => {
      const { downloadRepo } = createSetup();
      const giantDocId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      downloadRepo.setTarget(giantDocId, {
        document: {
          id: giantDocId,
          title: "giant.pdf",
          categoryId: "cat-1",
          processingStatus: "completed",
          deletedAt: null,
        },
        file: {
          id: "fil-giant",
          storageKey: "documents/giant.pdf",
          originalName: "giant.pdf",
          mimeType: "application/pdf",
          fileSize: 0x100000000, // 4 GiB + 1
          fileExtension: "pdf",
        },
        categoryPermission: { downloadEnabled: true },
      });

      const { executeBulkDownloadOperation } = await import("./bulk-download.operations");
      await expect(
        executeBulkDownloadOperation(
          { downloadRepository: downloadRepo, storage: createMockStorage() },
          {
            documentIds: [giantDocId],
            user: { id: "u1", email: "u1@test.local", role: "admin", name: "Admin" },
          },
        ),
      ).rejects.toThrow(/melebihi batas 32-bit \(4 GiB\)/);
    });

    test("throws PayloadTooLargeError when document count exceeds 65,535 entries", async () => {
      const { downloadRepo } = createSetup();
      const fakeIds = Array.from({ length: 65536 }, (_, i) => `doc-${i}`);

      const { executeBulkDownloadOperation } = await import("./bulk-download.operations");
      await expect(
        executeBulkDownloadOperation(
          { downloadRepository: downloadRepo, storage: createMockStorage() },
          {
            documentIds: fakeIds,
            user: { id: "u1", email: "u1@test.local", role: "admin", name: "Admin" },
          },
        ),
      ).rejects.toThrow(/melebihi batas maksimum arsip ZIP \(65\.535\)/);
    });
  });

  describe("Prefetch & Failure Semantics (Opsi A: F7, F12, F15, F17, F18, F20)", () => {
    test("prefetches all storage objects before response creation and audit recording (F7, F17)", async () => {
      const getObjectCalls: string[] = [];
      const trackingStorage: StorageAdapter = {
        ...createMockStorage(),
        getObject: async (key: string) => {
          getObjectCalls.push(key);
          return key.endsWith(".pdf") ? pdfBytes1 : docxBytes2;
        },
      };

      const { app, downloadRepo } = createSetup(trackingStorage);
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [ENABLED_DOC_1, ENABLED_DOC_2] }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/zip");

      // Verify all requested files were prefetched upfront before Response returned
      expect(getObjectCalls).toHaveLength(2);
      expect(getObjectCalls[0]).toBe("storage/doc1.pdf");
      expect(getObjectCalls[1]).toBe("storage/doc2.docx");

      const contentLengthHeader = response.headers.get("content-length");
      expect(contentLengthHeader).not.toBeNull();
      const expectedLength = Number(contentLengthHeader);
      expect(expectedLength).toBeGreaterThan(0);

      const arrayBuffer = await response.arrayBuffer();
      expect(arrayBuffer.byteLength).toBe(expectedLength);

      const names = parseZipEntryNames(new Uint8Array(arrayBuffer));
      expect(names.size).toBe(2);
      expect(names.has("laporan.pdf")).toBe(true);
      expect(names.has("kontrak.docx")).toBe(true);
      expect(downloadRepo.getRecordedAuditEvents()).toHaveLength(2);
    });

    test("returns 500 JSON and records zero audit when storage getObject fails on first file (F12, F17, F20)", async () => {
      const failingStorage: StorageAdapter = {
        ...createMockStorage(),
        getObject: async () => {
          throw new Error("MinIO storage unavailable on file 1");
        },
      };

      const { app, downloadRepo } = createSetup(failingStorage);
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [ENABLED_DOC_1, ENABLED_DOC_2] }),
      });

      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      const parsed = apiErrorSchema.safeParse(body);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.success).toBe(false);
        expect(parsed.data.error.code).toBe("INTERNAL_ERROR");
      }

      // Proves F12 & F17: Failed storage download records ZERO audit events
      expect(downloadRepo.getRecordedAuditEvents()).toHaveLength(0);
    });

    test("returns 500 JSON and records zero audit when storage getObject fails on second file (F12, F17, F20)", async () => {
      let callCount = 0;
      const failingStorage: StorageAdapter = {
        ...createMockStorage(),
        getObject: async () => {
          callCount++;
          if (callCount === 2) {
            throw new Error("MinIO network reset on file 2");
          }
          return pdfBytes1;
        },
      };

      const { app, downloadRepo } = createSetup(failingStorage);
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [ENABLED_DOC_1, ENABLED_DOC_2] }),
      });

      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = await response.json();
      const parsed = apiErrorSchema.safeParse(body);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.success).toBe(false);
        expect(parsed.data.error.code).toBe("INTERNAL_ERROR");
      }

      // Proves F12 & F17: Failed storage download records ZERO audit events
      expect(downloadRepo.getRecordedAuditEvents()).toHaveLength(0);
    });

    test("returns 500 JSON and records zero audit when actual byte length differs from metadata size (F15, F17)", async () => {
      const corruptStorage: StorageAdapter = {
        ...createMockStorage(),
        getObject: async (key: string) => {
          if (key === "storage/doc2.docx") {
            return new Uint8Array([1, 2, 3]); // Corrupt 3 bytes instead of docxBytes2 (6 bytes)
          }
          return pdfBytes1;
        },
      };

      const { app, downloadRepo } = createSetup(corruptStorage);
      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentIds: [ENABLED_DOC_1, ENABLED_DOC_2] }),
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      const parsed = apiErrorSchema.safeParse(body);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.success).toBe(false);
        expect(parsed.data.error.code).toBe("INTERNAL_ERROR");
      }

      // Proves F15 & F17: Size mismatch records ZERO audit events
      expect(downloadRepo.getRecordedAuditEvents()).toHaveLength(0);
    });

    test("forwards request-scoped logger and requestId when audit recording fails (F18)", async () => {
      const rawLogStrings: string[] = [];
      const isRecord = (val: unknown): val is Record<string, unknown> =>
        typeof val === "object" && val !== null;

      const customLogger = createLogger({
        service: "axentra-api",
        environment: "test",
        version: "0.1.0",
        level: "error",
        destination: {
          write(str: string): void {
            rawLogStrings.push(str);
          },
        },
      });

      const { downloadRepo } = createSetup();
      const fakeTx: IDownloadRepository = {
        findDownloadTarget: (id) => downloadRepo.findDownloadTarget(id),
        findDownloadTargets: (ids) => downloadRepo.findDownloadTargets(ids),
        recordDownloadAuditEvent: (event) => downloadRepo.recordDownloadAuditEvent(event),
        transaction: (fn) => downloadRepo.transaction(fn),
        checkCategoryPermissions: async () => [
          {
            documentId: ENABLED_DOC_1,
            categoryId: "cat-reporting-1",
            deletedAt: null,
            downloadEnabled: true,
          },
        ],
        recordDownloadAuditEvents: async () => {
          throw new Error("Database transaction disk full");
        },
      };
      downloadRepo.transaction = async <T>(
        fn: (txRepo: IDownloadRepository) => Promise<T>,
      ): Promise<T> => fn(fakeTx);

      const service = createDocumentService({
        downloadRepository: downloadRepo,
        storage: createMockStorage(),
        logger: customLogger,
      });

      const app = createApp({
        documentService: service,
        tokenVerifier,
        logger: customLogger,
        version: "0.1.0",
        readinessChecks: [],
      });

      const response = await app.request("/api/v1/documents/bulk-download", {
        method: "POST",
        headers: {
          Authorization: "Bearer member-token",
          "Content-Type": "application/json",
          "x-request-id": "req-bulk-audit-failure-123",
        },
        body: JSON.stringify({ documentIds: [ENABLED_DOC_1] }),
      });

      expect(response.status).toBe(500);

      // Verify that the operation-level error log captured the requestId passed through context
      const logCalls = rawLogStrings.map((str) => JSON.parse(str) as unknown).filter(isRecord);
      const operationLog = logCalls.find((call) => call.requestId === "req-bulk-audit-failure-123");
      expect(operationLog).toBeDefined();
      expect(operationLog?.requestId).toBe("req-bulk-audit-failure-123");
      expect(operationLog?.userId).toBe("usr-member-1");
      expect(operationLog?.documentCount).toBe(1);
    });

    test("returns 429 TOO_MANY_REQUESTS when bulk download concurrency queue is exceeded (F7, F10)", async () => {
      const { BulkDownloadSemaphore } = await import("./bulk-download.semaphore");
      const { executeBulkDownloadOperation } = await import("./bulk-download.operations");
      const { downloadRepo } = createSetup();

      const saturatedSemaphore = new BulkDownloadSemaphore({
        maxConcurrency: 1,
        maxQueueLength: 0,
      });
      // Occupy the only slot
      await saturatedSemaphore.acquire();

      await expect(
        executeBulkDownloadOperation(
          {
            downloadRepository: downloadRepo,
            storage: createMockStorage(),
            bulkDownloadSemaphore: saturatedSemaphore,
          },
          {
            documentIds: [ENABLED_DOC_1],
            user: { id: "usr-member-1", email: "member@axentra.local", role: "member_team" },
          },
        ),
      ).rejects.toThrow("Terlalu banyak permintaan unduhan massal secara bersamaan, antrean penuh");
    });
  });
});
