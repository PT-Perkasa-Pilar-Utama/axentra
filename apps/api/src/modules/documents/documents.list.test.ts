import { describe, expect, test } from "bun:test";
import { createLogger } from "@axentra/observability";
import {
  apiErrorSchema,
  recentDocumentListResponseSchema,
  type RecentDocument,
} from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { createDocumentService } from "./documents.service";
import type { QueueProducer } from "@axentra/queue";
import type { IDocumentRepository, RecentDocumentPage } from "./documents.repository";

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
    return null;
  },
};

const laporan: RecentDocument = {
  id: "11111111-1111-4111-8111-111111111111",
  filename: "laporan.pdf",
  processingStatus: "completed",
  createdAt: "2026-09-22T02:00:00.000Z",
};

function repositoryWith(page: RecentDocumentPage): IDocumentRepository {
  return {
    findExistingHashes: async () => new Set<string>(),
    listRecentDocuments: async () => page,
    saveDocumentBatch: async () => [],
    findDocumentById: async () => null,
    findDocumentFileByDocumentId: async () => null,
    markProcessingEnqueueFailed: async () => undefined,
  };
}

function appWith(repository: IDocumentRepository) {
  return createApp({
    logger: testLogger,
    version: "0.1.0",
    readinessChecks: [],
    tokenVerifier,
    documentService: createDocumentService({ repository }),
  });
}

describe("GET /api/v1/documents — BE-S1-06", () => {
  test("returns 401 when the bearer token is missing or rejected", async () => {
    const missing = await appWith(repositoryWith(pageOf([]))).request("/api/v1/documents");
    const rejected = await appWith(repositoryWith(pageOf([]))).request("/api/v1/documents", {
      headers: { authorization: "Bearer forged-token" },
    });

    expect(missing.status).toBe(401);
    expect(rejected.status).toBe(401);
    const body = apiErrorSchema.parse(await rejected.json());
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("returns laporan.pdf for member_team with pagination meta and no Sprint 2 fields", async () => {
    const response = await appWith(repositoryWith(pageOf([laporan]))).request("/api/v1/documents", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(200);
    const body = recentDocumentListResponseSchema.parse(await response.json());
    expect(body.success).toBe(true);
    expect(body.data).toEqual([laporan]);
    expect(body.data[0]).not.toHaveProperty("tags");
    expect(body.data[0]).not.toHaveProperty("category");
    expect(body.meta).toEqual({ page: 1, limit: 20, total: 1 });
  });

  test("returns the same list for head_of_team", async () => {
    const response = await appWith(repositoryWith(pageOf([laporan]))).request(
      "/api/v1/documents?page=1&limit=20",
      { headers: { authorization: "Bearer head-token" } },
    );

    expect(response.status).toBe(200);
    const body = recentDocumentListResponseSchema.parse(await response.json());
    expect(body.data[0]?.filename).toBe("laporan.pdf");
  });

  test("returns 400 when limit is above 100", async () => {
    const response = await appWith(repositoryWith(pageOf([]))).request(
      "/api/v1/documents?limit=101",
      { headers: { authorization: "Bearer member-token" } },
    );

    expect(response.status).toBe(400);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("stays mounted when the upload route is disabled", async () => {
    const response = await appWith(repositoryWith(pageOf([laporan]))).request("/api/v1/documents", {
      headers: { authorization: "Bearer member-token" },
    });
    const upload = await appWith(repositoryWith(pageOf([laporan]))).request(
      "/api/v1/documents/upload",
      { method: "POST", headers: { authorization: "Bearer member-token" } },
    );

    expect(response.status).toBe(200);
    expect(upload.status).toBe(404);
  });

  test("lists a file saved by the default upload repository", async () => {
    const queue: QueueProducer = {
      enqueueSystemHealthCheck: async () => "health-job",
      enqueueDocumentProcessing: async (payload) => payload.jobId,
      reconcileDocumentProcessing: async (payload) => payload.jobId,
      close: async () => undefined,
    };
    const service = createDocumentService({ queue });
    const bytes = new TextEncoder().encode("%PDF-1.4\n% laporan\n");

    await service.uploadDocuments([
      {
        filename: "laporan.pdf",
        mimeType: "application/pdf",
        size: bytes.byteLength,
        bytes,
      },
    ]);
    const listed = await service.listRecentDocuments(1, 20);

    expect(listed.items[0]?.filename).toBe("laporan.pdf");
    expect(listed.items[0]?.processingStatus).toBe("queued");
    expect(listed.meta.total).toBe(1);
  });
});

function pageOf(items: ReadonlyArray<RecentDocument>): RecentDocumentPage {
  return { items, meta: { page: 1, limit: 20, total: items.length } };
}
