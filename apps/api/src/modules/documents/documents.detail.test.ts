import { describe, expect, test } from "bun:test";
import { createLogger } from "@axentra/observability";
import type { QueueProducer } from "@axentra/queue";
import {
  apiErrorSchema,
  documentDetailSchema,
  type CategorySummary,
  type SmartTag,
} from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { readDocumentDetail, resolveCanDownload } from "./documents.detail.operations";
import type { DocumentDetailRecord } from "./documents.detail.repository";
import type { DocumentMetadataRecord } from "./metadata.repository";
import { createDocumentService } from "./documents.service";

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
        name: "Member",
      };
    }
    if (token === "head-token") {
      return { id: "usr-head-1", email: "head@axentra.local", role: "head_of_team", name: "Head" };
    }
    return null;
  },
};

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const CREATED_AT = new Date("2026-10-20T08:00:00.000Z");
const CATEGORY: CategorySummary = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Reporting",
  slug: "reporting",
  downloadEnabled: true,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};
const TAG: SmartTag = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "strategy",
  createdAt: "2026-10-20T08:00:00.000Z",
};

function recordFixture(): DocumentDetailRecord {
  return {
    document: {
      id: DOCUMENT_ID,
      title: "laporan.pdf",
      categoryId: CATEGORY.id,
      processingStatus: "completed",
      errorMessage: null,
      processingRecoveryAttempts: 0,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      deletedAt: null,
    },
    file: {
      id: "44444444-4444-4444-8444-444444444444",
      documentId: DOCUMENT_ID,
      storageKey: "documents/laporan.pdf",
      originalName: "laporan.pdf",
      mimeType: "application/pdf",
      fileSize: 2048,
      fileExtension: "pdf",
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
  };
}

function metadataFixture(): DocumentMetadataRecord {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    documentId: DOCUMENT_ID,
    author: "Dr. Siti Rahma",
    extractedText: null,
    rawMetadata: null,
    extractedAt: CREATED_AT,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function dependenciesWith(options: {
  record: DocumentDetailRecord | null;
  category: CategorySummary | null;
  tags: ReadonlyArray<SmartTag>;
  metadata: DocumentMetadataRecord | null;
}) {
  return {
    repository: { findDocumentDetail: async () => options.record },
    metadataRepository: { findMetadataByDocumentId: async () => options.metadata },
    smartTagsRepository: { findSmartTagsByDocumentId: async () => options.tags },
    categoryRepository: { findCategoryByDocumentId: async () => options.category },
  };
}

describe("canDownload rule for document detail (AC-13.01)", () => {
  test("member_team can download only from an enabled category", () => {
    const disabled = { ...CATEGORY, downloadEnabled: false };

    expect(resolveCanDownload("member_team", null)).toBe(false);
    expect(resolveCanDownload("member_team", disabled)).toBe(false);
    expect(resolveCanDownload("member_team", CATEGORY)).toBe(true);
  });

  test("head_of_team and admin are not gated by the category permission", () => {
    const disabled = { ...CATEGORY, downloadEnabled: false };

    expect(resolveCanDownload("head_of_team", null)).toBe(true);
    expect(resolveCanDownload("head_of_team", disabled)).toBe(true);
    expect(resolveCanDownload("admin", null)).toBe(true);
  });
});

describe("readDocumentDetail composition", () => {
  test("maps the document, file, category, Smart Tags, and metadata into the detail contract", async () => {
    const detail = await readDocumentDetail(
      dependenciesWith({
        record: recordFixture(),
        category: CATEGORY,
        tags: [TAG],
        metadata: metadataFixture(),
      }),
      DOCUMENT_ID,
      "member_team",
    );

    expect(documentDetailSchema.safeParse(detail).success).toBe(true);
    expect(detail).toMatchObject({
      id: DOCUMENT_ID,
      title: "laporan.pdf",
      processingStatus: "completed",
      category: CATEGORY,
      tags: [TAG],
      file: {
        id: "44444444-4444-4444-8444-444444444444",
        originalName: "laporan.pdf",
        mimeType: "application/pdf",
        fileSize: 2048,
        fileExtension: "pdf",
        createdAt: "2026-10-20T08:00:00.000Z",
      },
      metadata: { author: "Dr. Siti Rahma", extractedAt: "2026-10-20T08:00:00.000Z" },
      errorMessage: null,
      canDownload: true,
      createdAt: "2026-10-20T08:00:00.000Z",
      updatedAt: "2026-10-20T08:00:00.000Z",
    });
  });

  test("returns metadata null and canDownload false for an uncategorized document read by member_team", async () => {
    const record = recordFixture();
    const uncategorized: DocumentDetailRecord = {
      document: { ...record.document, categoryId: null },
      file: record.file,
    };

    const detail = await readDocumentDetail(
      dependenciesWith({ record: uncategorized, category: null, tags: [], metadata: null }),
      DOCUMENT_ID,
      "member_team",
    );

    expect(detail.metadata).toBeNull();
    expect(detail.category).toBeNull();
    expect(detail.canDownload).toBe(false);
    expect(documentDetailSchema.safeParse(detail).success).toBe(true);
  });

  test("throws NotFound when the active document or its file record is absent", async () => {
    await expect(
      readDocumentDetail(
        dependenciesWith({ record: null, category: null, tags: [], metadata: null }),
        DOCUMENT_ID,
        "member_team",
      ),
    ).rejects.toThrow("Dokumen tidak ditemukan");
  });
});

describe("GET /api/v1/documents/:id", () => {
  const queue: QueueProducer = {
    enqueueSystemHealthCheck: async () => "health-job",
    enqueueDocumentProcessing: async (payload) => payload.jobId,
    reconcileDocumentProcessing: async (payload) => payload.jobId,
    close: async () => undefined,
  };

  function appWithUpload(filename: string) {
    const service = createDocumentService({ queue });
    return {
      service,
      app: createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        tokenVerifier,
        documentService: service,
      }),
      upload: async () => {
        const bytes = new TextEncoder().encode(`%PDF-1.4\n% ${filename}\n`);
        await service.uploadDocuments([
          { filename, mimeType: "application/pdf", size: bytes.byteLength, bytes },
        ]);
        const listed = await service.listRecentDocuments(1, 20);
        return listed.items.find((item) => item.filename === filename)?.id ?? "";
      },
    };
  }

  test("returns 401 without a bearer token", async () => {
    const { app } = appWithUpload("laporan.pdf");
    const response = await app.request(`/api/v1/documents/${DOCUMENT_ID}`);

    expect(response.status).toBe(401);
  });

  test("returns 400 when the id is not a UUID", async () => {
    const { app } = appWithUpload("laporan.pdf");
    const response = await app.request("/api/v1/documents/not-a-uuid", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(400);
    expect(apiErrorSchema.safeParse(await response.json()).success).toBe(true);
  });

  test("returns 404 when no active document has the id", async () => {
    const { app } = appWithUpload("laporan.pdf");
    const response = await app.request(`/api/v1/documents/${DOCUMENT_ID}`, {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(404);
  });

  test("returns the uploaded document detail to member_team with canDownload false when uncategorized", async () => {
    const { app, upload } = appWithUpload("laporan.pdf");
    const id = await upload();
    const response = await app.request(`/api/v1/documents/${id}`, {
      headers: { authorization: "Bearer member-token" },
    });
    const body: unknown = await response.json();
    const parsed = documentDetailSchema.safeParse(
      typeof body === "object" && body !== null && "data" in body ? body.data : undefined,
    );

    expect(response.status).toBe(200);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({
      id,
      title: "laporan.pdf",
      processingStatus: "queued",
      canDownload: false,
      tags: [],
      metadata: null,
      file: { originalName: "laporan.pdf", mimeType: "application/pdf" },
    });
  });

  test("returns canDownload true to head_of_team for the same uncategorized document", async () => {
    const { app, upload } = appWithUpload("kontrak.pdf");
    const id = await upload();
    const response = await app.request(`/api/v1/documents/${id}`, {
      headers: { authorization: "Bearer head-token" },
    });
    const body: unknown = await response.json();
    const data = typeof body === "object" && body !== null && "data" in body ? body.data : null;
    const parsed = documentDetailSchema.safeParse(data);

    expect(response.status).toBe(200);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.canDownload).toBe(true);
  });
});
