import { describe, expect, it } from "bun:test";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createLogger } from "@axentra/observability";
import {
  adminArchiveDocumentResponseSchema,
  adminDeleteDocumentResponseSchema,
  adminDocumentDetailResponseSchema,
  adminDocumentsListResponseSchema,
  adminUnarchiveDocumentResponseSchema,
  apiErrorSchema,
} from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { recheckAndRecordBulkAudit } from "../documents/bulk-download.audit";
import { resolveBulkDownloadItems } from "../documents/bulk-download.targets";
import { InMemoryDownloadRepository } from "../documents/download.in-memory-repository";
import { executeDownloadOperation } from "../documents/download.operations";
import { readStoredMetadata } from "../documents/documents.metadata.operations";
import { createInMemoryStorage } from "../documents/documents.service.helpers";
import { InMemoryDocumentMetadataRepository } from "../documents/metadata.repository";
import { assertPreviewAllowed } from "../documents/preview.operations";
import { DrizzleAdminRepository, InMemoryAdminRepository } from "./admin.repository";
import { createAdminService } from "./admin.service";

const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const tokenVerifier: TokenVerifier = {
  verifyToken(token: string) {
    if (token === "valid-admin-token") {
      return {
        id: "11111111-1111-4111-8111-111111111111",
        email: "admin@axentra.local",
        role: "admin",
        name: "Admin User",
      };
    }
    if (token === "valid-head-token") {
      return {
        id: "22222222-2222-4222-8222-222222222222",
        email: "head@axentra.local",
        role: "head_of_team",
        name: "Head User",
      };
    }
    if (token === "valid-member-token") {
      return {
        id: "33333333-3333-4333-8333-333333333333",
        email: "member@axentra.local",
        role: "member_team",
        name: "Member User",
      };
    }
    return null;
  },
};

const DOC_1_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const DOC_2_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const DOC_3_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const DOC_DELETED_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
const DOC_FILELESS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5";
const MISSING_DOC_ID = "99999999-9999-4999-8999-999999999999";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FIXED_NOW = new Date("2026-11-05T12:00:00.000Z");

function isPostgresDatabase(value: unknown): value is PostgresJsDatabase {
  return typeof value === "object" && value !== null && ("select" in value || "update" in value);
}

function createFakePostgresDatabase(fakeDb: unknown): PostgresJsDatabase {
  if (!isPostgresDatabase(fakeDb)) {
    throw new Error("Expected fake database object with select or update method");
  }
  return fakeDb;
}

function createSeededFixture() {
  const repository = new InMemoryAdminRepository();
  repository.users.set(OWNER_ID, {
    id: OWNER_ID,
    role: "member_team",
    name: "Rina Pratama",
    email: "rina@axentra.local",
  });
  repository.categories.set(CATEGORY_ID, {
    id: CATEGORY_ID,
    name: "Reporting",
  });

  repository.documents.set(DOC_1_ID, {
    id: DOC_1_ID,
    title: "Laporan-Q1-2026.pdf",
    uploadedBy: OWNER_ID,
    categoryId: CATEGORY_ID,
    metadata: {
      author: "Rina Pratama",
      extractedAt: new Date("2026-04-17T08:01:00.000Z"),
      rawMetadata: { producer: "LibreOffice", secret: "internal" },
      extractedText: "Confidential text body",
    },
    createdAt: new Date("2026-04-17T08:00:00.000Z"),
    archivedAt: null,
    deletedAt: null,
    hasFile: true,
  });

  repository.documents.set(DOC_2_ID, {
    id: DOC_2_ID,
    title: "Dokumen-Arsip.pdf",
    uploadedBy: null,
    categoryId: null,
    metadata: null,
    createdAt: new Date("2026-04-17T08:00:00.000Z"),
    archivedAt: new Date("2026-11-04T03:00:00.000Z"),
    deletedAt: null,
    hasFile: true,
  });

  repository.documents.set(DOC_3_ID, {
    id: DOC_3_ID,
    title: "Memo-Terbaru.docx",
    uploadedBy: OWNER_ID,
    categoryId: null,
    metadata: null,
    createdAt: new Date("2026-11-01T10:00:00.000Z"),
    archivedAt: null,
    deletedAt: null,
    hasFile: true,
  });

  repository.documents.set(DOC_DELETED_ID, {
    id: DOC_DELETED_ID,
    title: "Sudah-Dihapus.pdf",
    uploadedBy: OWNER_ID,
    categoryId: CATEGORY_ID,
    metadata: null,
    createdAt: new Date("2026-11-02T10:00:00.000Z"),
    archivedAt: null,
    deletedAt: new Date("2026-11-03T10:00:00.000Z"),
    hasFile: true,
  });

  repository.documents.set(DOC_FILELESS_ID, {
    id: DOC_FILELESS_ID,
    title: "Tanpa-File.pdf",
    uploadedBy: OWNER_ID,
    categoryId: null,
    metadata: null,
    createdAt: new Date("2026-11-02T11:00:00.000Z"),
    archivedAt: null,
    deletedAt: null,
    hasFile: false,
  });

  const adminService = createAdminService(repository, { now: () => FIXED_NOW });
  const app = createApp({
    logger: testLogger,
    version: "0.1.0",
    readinessChecks: [],
    tokenVerifier,
    adminService,
  });

  return { repository, adminService, app };
}

describe("Admin Document Management API (Task BE-S4-07 / PROP-ADM-AC-03.01 to 03.05)", () => {
  describe("GET /api/v1/admin/documents", () => {
    it("lists active and archived documents with deterministic created_at DESC, id DESC order and excludes soft-deleted or fileless rows", async () => {
      const { app } = createSeededFixture();

      const res = await app.request("/api/v1/admin/documents", {
        headers: { Authorization: "Bearer valid-admin-token" },
      });

      expect(res.status).toBe(200);
      const parsed = adminDocumentsListResponseSchema.parse(await res.json());
      expect(parsed.meta).toEqual({ page: 1, limit: 20, total: 3 });
      expect(parsed.data.map((d) => d.id)).toEqual([DOC_3_ID, DOC_2_ID, DOC_1_ID]);

      expect(parsed.data[0]).toEqual({
        id: DOC_3_ID,
        title: "Memo-Terbaru.docx",
        ownerId: OWNER_ID,
        ownerName: "Rina Pratama",
        uploadedAt: "2026-11-01T10:00:00.000Z",
        archivedAt: null,
      });

      // Legacy row without uploader has ownerId: null and ownerName: null (O8).
      expect(parsed.data[1]).toEqual({
        id: DOC_2_ID,
        title: "Dokumen-Arsip.pdf",
        ownerId: null,
        ownerName: null,
        uploadedAt: "2026-04-17T08:00:00.000Z",
        archivedAt: "2026-11-04T03:00:00.000Z",
      });
    });

    it("applies page and limit query parameters", async () => {
      const { app } = createSeededFixture();

      const res = await app.request("/api/v1/admin/documents?page=2&limit=1", {
        headers: { Authorization: "Bearer valid-admin-token" },
      });

      expect(res.status).toBe(200);
      const parsed = adminDocumentsListResponseSchema.parse(await res.json());
      expect(parsed.meta).toEqual({ page: 2, limit: 1, total: 3 });
      expect(parsed.data.map((d) => d.id)).toEqual([DOC_2_ID]);
    });

    it("returns 400 VALIDATION_ERROR for invalid page or limit", async () => {
      const { app } = createSeededFixture();

      const res = await app.request("/api/v1/admin/documents?page=0&limit=101", {
        headers: { Authorization: "Bearer valid-admin-token" },
      });

      expect(res.status).toBe(400);
      const err = apiErrorSchema.parse(await res.json());
      expect(err.error.code).toBe("VALIDATION_ERROR");
      expect(err.error.message).toBe("Data tidak valid");
    });

    it("enforces authentication and admin role on list endpoint", async () => {
      const { app } = createSeededFixture();

      const unauth = await app.request("/api/v1/admin/documents");
      expect(unauth.status).toBe(401);

      const member = await app.request("/api/v1/admin/documents", {
        headers: { Authorization: "Bearer valid-member-token" },
      });
      expect(member.status).toBe(403);

      const head = await app.request("/api/v1/admin/documents", {
        headers: { Authorization: "Bearer valid-head-token" },
      });
      expect(head.status).toBe(403);
    });
  });

  describe("GET /api/v1/admin/documents/:id", () => {
    it("returns document detail with category and descriptive metadata only (no rawMetadata, extractedText, or storageKey)", async () => {
      const { app } = createSeededFixture();

      const res = await app.request(`/api/v1/admin/documents/${DOC_1_ID}`, {
        headers: { Authorization: "Bearer valid-admin-token" },
      });

      expect(res.status).toBe(200);
      const rawBody: unknown = await res.json();
      const parsed = adminDocumentDetailResponseSchema.parse(rawBody);
      expect(parsed.data).toEqual({
        id: DOC_1_ID,
        title: "Laporan-Q1-2026.pdf",
        ownerId: OWNER_ID,
        ownerName: "Rina Pratama",
        uploadedAt: "2026-04-17T08:00:00.000Z",
        archivedAt: null,
        categoryId: CATEGORY_ID,
        categoryName: "Reporting",
        metadata: {
          author: "Rina Pratama",
          extractedAt: "2026-04-17T08:01:00.000Z",
        },
      });

      const serialized = JSON.stringify(rawBody);
      expect(serialized).not.toContain("rawMetadata");
      expect(serialized).not.toContain("extractedText");
      expect(serialized).not.toContain("storageKey");
      expect(serialized).not.toContain("downloadUrl");
    });

    it("returns archived document detail with null category and null metadata when unextracted", async () => {
      const { app } = createSeededFixture();

      const res = await app.request(`/api/v1/admin/documents/${DOC_2_ID}`, {
        headers: { Authorization: "Bearer valid-admin-token" },
      });

      expect(res.status).toBe(200);
      const parsed = adminDocumentDetailResponseSchema.parse(await res.json());
      expect(parsed.data).toEqual({
        id: DOC_2_ID,
        title: "Dokumen-Arsip.pdf",
        ownerId: null,
        ownerName: null,
        uploadedAt: "2026-04-17T08:00:00.000Z",
        archivedAt: "2026-11-04T03:00:00.000Z",
        categoryId: null,
        categoryName: null,
        metadata: null,
      });
    });

    it("returns 400 for non-UUID id and 404 for missing, soft-deleted, or fileless documents", async () => {
      const { app } = createSeededFixture();

      const invalidUuid = await app.request("/api/v1/admin/documents/not-a-uuid", {
        headers: { Authorization: "Bearer valid-admin-token" },
      });
      expect(invalidUuid.status).toBe(400);
      expect(apiErrorSchema.parse(await invalidUuid.json()).error.code).toBe("VALIDATION_ERROR");

      for (const id of [MISSING_DOC_ID, DOC_DELETED_ID, DOC_FILELESS_ID]) {
        const notFound = await app.request(`/api/v1/admin/documents/${id}`, {
          headers: { Authorization: "Bearer valid-admin-token" },
        });
        expect(notFound.status).toBe(404);
        expect(apiErrorSchema.parse(await notFound.json()).error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("POST /api/v1/admin/documents/:id/archive and /unarchive", () => {
    it("archives an active document and is idempotent when called again", async () => {
      const { app } = createSeededFixture();

      const firstRes = await app.request(`/api/v1/admin/documents/${DOC_1_ID}/archive`, {
        method: "POST",
        headers: { Authorization: "Bearer valid-admin-token" },
      });
      expect(firstRes.status).toBe(200);
      const firstParsed = adminArchiveDocumentResponseSchema.parse(await firstRes.json());
      expect(firstParsed.data).toEqual({
        id: DOC_1_ID,
        archivedAt: FIXED_NOW.toISOString(),
      });

      // Archiving an already-archived document preserves its existing archivedAt timestamp.
      const alreadyArchivedRes = await app.request(`/api/v1/admin/documents/${DOC_2_ID}/archive`, {
        method: "POST",
        headers: { Authorization: "Bearer valid-admin-token" },
      });
      expect(alreadyArchivedRes.status).toBe(200);
      const secondParsed = adminArchiveDocumentResponseSchema.parse(
        await alreadyArchivedRes.json(),
      );
      expect(secondParsed.data).toEqual({
        id: DOC_2_ID,
        archivedAt: "2026-11-04T03:00:00.000Z",
      });
    });

    it("unarchives an archived document and is idempotent when already active", async () => {
      const { app } = createSeededFixture();

      const unarchiveRes = await app.request(`/api/v1/admin/documents/${DOC_2_ID}/unarchive`, {
        method: "POST",
        headers: { Authorization: "Bearer valid-admin-token" },
      });
      expect(unarchiveRes.status).toBe(200);
      expect(adminUnarchiveDocumentResponseSchema.parse(await unarchiveRes.json()).data).toEqual({
        id: DOC_2_ID,
        archivedAt: null,
      });

      const idempotentRes = await app.request(`/api/v1/admin/documents/${DOC_2_ID}/unarchive`, {
        method: "POST",
        headers: { Authorization: "Bearer valid-admin-token" },
      });
      expect(idempotentRes.status).toBe(200);
      expect(adminUnarchiveDocumentResponseSchema.parse(await idempotentRes.json()).data).toEqual({
        id: DOC_2_ID,
        archivedAt: null,
      });
    });

    it("returns 404 when archiving or unarchiving a missing, soft-deleted, or fileless document", async () => {
      const { app } = createSeededFixture();

      for (const action of ["archive", "unarchive"]) {
        for (const id of [MISSING_DOC_ID, DOC_DELETED_ID, DOC_FILELESS_ID]) {
          const res = await app.request(`/api/v1/admin/documents/${id}/${action}`, {
            method: "POST",
            headers: { Authorization: "Bearer valid-admin-token" },
          });
          expect(res.status).toBe(404);
          expect(apiErrorSchema.parse(await res.json()).error.code).toBe("NOT_FOUND");
        }
      }
    });
  });

  describe("DELETE /api/v1/admin/documents/:id", () => {
    it("soft-deletes a document while retaining the record and hides it from subsequent Admin queries", async () => {
      const { app, repository } = createSeededFixture();

      const deleteRes = await app.request(`/api/v1/admin/documents/${DOC_1_ID}`, {
        method: "DELETE",
        headers: { Authorization: "Bearer valid-admin-token" },
      });
      expect(deleteRes.status).toBe(200);
      expect(adminDeleteDocumentResponseSchema.parse(await deleteRes.json()).data).toEqual({
        id: DOC_1_ID,
        deletedAt: FIXED_NOW.toISOString(),
      });

      // Row and metadata remain stored in the repository (soft delete only).
      const storedRecord = repository.documents.get(DOC_1_ID);
      expect(storedRecord).toBeDefined();
      expect(storedRecord?.deletedAt?.toISOString()).toBe(FIXED_NOW.toISOString());
      expect(storedRecord?.metadata?.author).toBe("Rina Pratama");

      // Subsequent detail, list, and delete calls treat it as soft-deleted.
      const detailAfterDelete = await app.request(`/api/v1/admin/documents/${DOC_1_ID}`, {
        headers: { Authorization: "Bearer valid-admin-token" },
      });
      expect(detailAfterDelete.status).toBe(404);

      const secondDelete = await app.request(`/api/v1/admin/documents/${DOC_1_ID}`, {
        method: "DELETE",
        headers: { Authorization: "Bearer valid-admin-token" },
      });
      expect(secondDelete.status).toBe(404);

      const listAfterDelete = await app.request("/api/v1/admin/documents", {
        headers: { Authorization: "Bearer valid-admin-token" },
      });
      const listParsed = adminDocumentsListResponseSchema.parse(await listAfterDelete.json());
      expect(listParsed.meta.total).toBe(2);
      expect(listParsed.data.map((d) => d.id)).toEqual([DOC_3_ID, DOC_2_ID]);
    });
  });

  describe("DrizzleAdminRepository document management unit tests", () => {
    it("maps listDocuments and findDocumentDetailById rows in DrizzleAdminRepository", async () => {
      let selectCount = 0;
      const fakeDb = {
        select() {
          selectCount += 1;
          const current = selectCount;
          return {
            from() {
              if (current === 1) {
                return {
                  innerJoin() {
                    return {
                      async where() {
                        return [{ total: "1" }];
                      },
                    };
                  },
                };
              }
              if (current === 2) {
                return {
                  innerJoin() {
                    return {
                      leftJoin() {
                        return {
                          where() {
                            return {
                              orderBy() {
                                return {
                                  limit() {
                                    return {
                                      async offset() {
                                        return [
                                          {
                                            id: DOC_1_ID,
                                            title: "Laporan.pdf",
                                            ownerId: OWNER_ID,
                                            ownerName: "Rina Pratama",
                                            uploadedAt: "2026-04-17T08:00:00.000Z",
                                            archivedAt: null,
                                          },
                                        ];
                                      },
                                    };
                                  },
                                };
                              },
                            };
                          },
                        };
                      },
                    };
                  },
                };
              }
              return {
                innerJoin() {
                  return {
                    leftJoin() {
                      return {
                        leftJoin() {
                          return {
                            leftJoin() {
                              return {
                                where() {
                                  return {
                                    async limit() {
                                      return [
                                        {
                                          id: DOC_1_ID,
                                          title: "Laporan.pdf",
                                          ownerId: OWNER_ID,
                                          ownerName: "Rina Pratama",
                                          uploadedAt: new Date("2026-04-17T08:00:00.000Z"),
                                          archivedAt: new Date("2026-11-04T03:00:00.000Z"),
                                          categoryId: CATEGORY_ID,
                                          categoryName: "Reporting",
                                          metadataId: "meta-1",
                                          metadataAuthor: "Rina Pratama",
                                          metadataExtractedAt: new Date("2026-04-17T08:01:00.000Z"),
                                        },
                                      ];
                                    },
                                  };
                                },
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };

      const repo = new DrizzleAdminRepository(createFakePostgresDatabase(fakeDb));
      const page = await repo.listDocuments({ page: 1, limit: 20 });
      expect(page.total).toBe(1);
      expect(page.items[0]?.ownerName).toBe("Rina Pratama");

      const detail = await repo.findDocumentDetailById(DOC_1_ID);
      expect(detail).toEqual({
        id: DOC_1_ID,
        title: "Laporan.pdf",
        ownerId: OWNER_ID,
        ownerName: "Rina Pratama",
        uploadedAt: "2026-04-17T08:00:00.000Z",
        archivedAt: "2026-11-04T03:00:00.000Z",
        categoryId: CATEGORY_ID,
        categoryName: "Reporting",
        metadata: {
          author: "Rina Pratama",
          extractedAt: "2026-04-17T08:01:00.000Z",
        },
      });
    });

    it("maps archiveDocument, unarchiveDocument, and softDeleteDocument updates in DrizzleAdminRepository", async () => {
      let updateCall = 0;
      const fakeDb = {
        update() {
          updateCall += 1;
          const current = updateCall;
          return {
            set() {
              return {
                where() {
                  return {
                    async returning() {
                      if (current === 1) {
                        return [{ id: DOC_1_ID, archivedAt: FIXED_NOW }];
                      }
                      if (current === 2) {
                        return [{ id: DOC_1_ID }];
                      }
                      if (current === 3) {
                        return [{ id: DOC_1_ID, deletedAt: FIXED_NOW }];
                      }
                      return [];
                    },
                  };
                },
              };
            },
          };
        },
      };

      const repo = new DrizzleAdminRepository(createFakePostgresDatabase(fakeDb));
      expect(await repo.archiveDocument(DOC_1_ID, FIXED_NOW)).toEqual({
        id: DOC_1_ID,
        archivedAt: FIXED_NOW.toISOString(),
      });
      expect(await repo.unarchiveDocument(DOC_1_ID, FIXED_NOW)).toEqual({
        id: DOC_1_ID,
        archivedAt: null,
      });
      expect(await repo.softDeleteDocument(DOC_1_ID, FIXED_NOW)).toEqual({
        id: DOC_1_ID,
        deletedAt: FIXED_NOW.toISOString(),
      });
      expect(await repo.archiveDocument(MISSING_DOC_ID, FIXED_NOW)).toBeNull();
    });
  });

  describe("Archived document exclusion on Member Team and Head of Team operations (O6 / PROP-ADM-AC-03.03)", () => {
    it("rejects archived documents with 404 NotFound across metadata, preview, download, and bulk-download operations", async () => {
      const metadataRepo = new InMemoryDocumentMetadataRepository();
      metadataRepo.addDocument({
        id: DOC_1_ID,
        title: "Laporan.pdf",
        processingStatus: "completed",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
        archivedAt: FIXED_NOW,
      });
      await expect(readStoredMetadata(metadataRepo, DOC_1_ID)).rejects.toThrow(
        "Dokumen tidak ditemukan",
      );

      expect(() =>
        assertPreviewAllowed({
          document: { id: DOC_1_ID, deletedAt: null, archivedAt: FIXED_NOW },
          file: {
            id: "file-1",
            storageKey: "docs/1.pdf",
            originalName: "Laporan.pdf",
            mimeType: "application/pdf",
            fileSize: 100,
          },
        }),
      ).toThrow("Dokumen tidak ditemukan");

      const downloadRepo = new InMemoryDownloadRepository();
      const archivedTarget = {
        document: {
          id: DOC_1_ID,
          title: "Laporan.pdf",
          categoryId: CATEGORY_ID,
          processingStatus: "completed",
          deletedAt: null,
          archivedAt: FIXED_NOW,
        },
        file: {
          id: "file-1",
          storageKey: "docs/1.pdf",
          originalName: "Laporan.pdf",
          mimeType: "application/pdf",
          fileSize: 100,
          fileExtension: "pdf",
        },
        categoryPermission: { downloadEnabled: true },
      };
      downloadRepo.setTarget(DOC_1_ID, archivedTarget);

      const headUser = {
        id: OWNER_ID,
        email: "head@axentra.local",
        role: "head_of_team" as const,
        name: "Head User",
      };

      await expect(
        executeDownloadOperation(
          { downloadRepository: downloadRepo, storage: createInMemoryStorage() },
          { documentId: DOC_1_ID, user: headUser },
        ),
      ).rejects.toThrow("Dokumen tidak ditemukan");

      expect(() => resolveBulkDownloadItems([DOC_1_ID], [archivedTarget], headUser)).toThrow(
        "Dokumen tidak ditemukan",
      );

      await expect(
        recheckAndRecordBulkAudit(downloadRepo, headUser, [
          {
            documentId: DOC_1_ID,
            categoryId: CATEGORY_ID,
            categoryPermission: { downloadEnabled: true },
            file: archivedTarget.file,
          },
        ]),
      ).rejects.toThrow("Dokumen tidak ditemukan");
    });
  });
});
