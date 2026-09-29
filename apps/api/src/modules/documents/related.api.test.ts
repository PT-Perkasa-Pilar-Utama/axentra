import { describe, expect, test } from "bun:test";
import type { documents } from "@axentra/db";
import { createLogger } from "@axentra/observability";
import {
  apiErrorSchema,
  relatedDocumentsResponseSchema,
  type RelatedDocument,
} from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { createDocumentService } from "./documents.service";
import type { IDocumentRepository } from "./documents.repository";

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const RELATED_ID = "22222222-2222-4222-8222-222222222222";
type SourceDocument = typeof documents.$inferSelect;
const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const tokenVerifier: TokenVerifier = {
  verifyToken(token: string) {
    if (token !== "member-token" && token !== "head-token") return null;
    return {
      id: token === "member-token" ? "usr-member-1" : "usr-head-1",
      email: token === "member-token" ? "member@axentra.local" : "head@axentra.local",
      role: token === "member-token" ? "member_team" : "head_of_team",
      name: token === "member-token" ? "Member User" : "Head User",
    };
  },
};

const sourceDocument: SourceDocument = {
  id: SOURCE_ID,
  title: "Source document",
  categoryId: null,
  processingStatus: "completed" as const,
  errorMessage: null,
  createdAt: new Date("2026-09-20T00:00:00.000Z"),
  updatedAt: new Date("2026-09-20T00:00:00.000Z"),
  deletedAt: null,
};

const relatedDocument: RelatedDocument = {
  id: RELATED_ID,
  filename: "laporan-tahunan.pdf",
  processingStatus: "completed",
  createdAt: "2026-09-22T02:00:00.000Z",
  sharedTags: ["keuangan", "tahunan"],
};

function appWith(source: SourceDocument | null, related: ReadonlyArray<RelatedDocument>) {
  const repository: IDocumentRepository = {
    findExistingHashes: async () => new Set<string>(),
    listRecentDocuments: async () => ({ items: [], meta: { page: 1, limit: 20, total: 0 } }),
    listRelatedDocuments: async () => related,
    saveDocumentBatch: async () => [],
    findDocumentById: async (id) => (id === SOURCE_ID ? source : null),
    findDocumentFileByDocumentId: async () => null,
    markProcessingEnqueueFailed: async () => undefined,
  };

  return createApp({
    logger: testLogger,
    version: "0.1.0",
    readinessChecks: [],
    tokenVerifier,
    documentService: createDocumentService({ repository }),
  });
}

describe("GET /api/v1/documents/:id/related — BE-S2-06", () => {
  test("returns related documents and their shared Smart Tags to member_team", async () => {
    const response = await appWith(sourceDocument, [relatedDocument]).request(
      `/api/v1/documents/${SOURCE_ID}/related`,
      { headers: { authorization: "Bearer member-token" } },
    );

    expect(response.status).toBe(200);
    const body = relatedDocumentsResponseSchema.parse(await response.json());
    expect(body.data).toEqual([relatedDocument]);
    expect(body.data[0]?.sharedTags.length).toBeGreaterThan(0);
  });

  test("allows head_of_team and returns an empty array when there are no matching tags", async () => {
    const response = await appWith(sourceDocument, []).request(
      `/api/v1/documents/${SOURCE_ID}/related`,
      { headers: { authorization: "Bearer head-token" } },
    );

    expect(response.status).toBe(200);
    const body = relatedDocumentsResponseSchema.parse(await response.json());
    expect(body.data).toEqual([]);
  });

  test("requires authentication", async () => {
    const response = await appWith(sourceDocument, []).request(
      `/api/v1/documents/${SOURCE_ID}/related`,
    );

    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("UNAUTHORIZED");
  });

  test("rejects an invalid document UUID", async () => {
    const response = await appWith(sourceDocument, []).request(
      "/api/v1/documents/not-a-uuid/related",
      { headers: { authorization: "Bearer member-token" } },
    );

    expect(response.status).toBe(400);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("ID dokumen harus berupa UUID yang valid");
  });

  test("returns not found for missing or deleted source documents", async () => {
    const missingResponse = await appWith(null, []).request(
      `/api/v1/documents/${SOURCE_ID}/related`,
      {
        headers: { authorization: "Bearer member-token" },
      },
    );
    const deletedResponse = await appWith(
      { ...sourceDocument, deletedAt: new Date("2026-09-23T00:00:00.000Z") },
      [],
    ).request(`/api/v1/documents/${SOURCE_ID}/related`, {
      headers: { authorization: "Bearer member-token" },
    });

    expect(missingResponse.status).toBe(404);
    expect(deletedResponse.status).toBe(404);
    expect(apiErrorSchema.parse(await deletedResponse.json()).error.code).toBe("NOT_FOUND");
  });
});
