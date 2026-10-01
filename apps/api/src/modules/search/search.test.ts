import { describe, expect, test } from "bun:test";
import { createLogger } from "@axentra/observability";
import {
  apiErrorSchema,
  searchDocumentsResponseSchema,
  type SearchDocument,
} from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { InMemorySearchRepository } from "./search.repository";
import { createSearchService } from "./search.service";

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

const docStrategy: SearchDocument = {
  id: "11111111-1111-4111-8111-111111111111",
  filename: "rencana-strategis.pdf",
  processingStatus: "completed",
  createdAt: "2026-09-22T02:00:00.000Z",
  snippet: null,
};

const docStrategyAndLegal: SearchDocument = {
  id: "22222222-2222-4222-8222-222222222222",
  filename: "kontrak-strategis.docx",
  processingStatus: "completed",
  createdAt: "2026-09-23T02:00:00.000Z",
  snippet: null,
};

const docLegalOnly: SearchDocument = {
  id: "33333333-3333-4333-8333-333333333333",
  filename: "perjanjian-legal.pdf",
  processingStatus: "completed",
  createdAt: "2026-09-24T02:00:00.000Z",
  snippet: null,
};

function setupTestApp() {
  const repository = new InMemorySearchRepository();
  repository.addDocument(docStrategy, { tags: ["strategy"] });
  repository.addDocument(docStrategyAndLegal, { tags: ["strategy", "legal"] });
  repository.addDocument(docLegalOnly, { tags: ["legal"] });

  const searchService = createSearchService(repository);

  const app = createApp({
    logger: testLogger,
    version: "0.1.0",
    readinessChecks: [],
    tokenVerifier,
    searchService,
  });

  return { app, repository };
}

describe("GET /api/v1/search/documents — BE-S2-03 (AC-04.03, AC-04.04)", () => {
  test("returns 401 when bearer token is missing or invalid", async () => {
    const { app } = setupTestApp();

    const missing = await app.request("/api/v1/search/documents");
    const invalid = await app.request("/api/v1/search/documents", {
      headers: { authorization: "Bearer invalid-token" },
    });

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    const body = apiErrorSchema.parse(await invalid.json());
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("allows both member_team and head_of_team access", async () => {
    const { app } = setupTestApp();

    const memberRes = await app.request("/api/v1/search/documents", {
      headers: { authorization: "Bearer member-token" },
    });
    const headRes = await app.request("/api/v1/search/documents", {
      headers: { authorization: "Bearer head-token" },
    });

    expect(memberRes.status).toBe(200);
    expect(headRes.status).toBe(200);
  });

  test("AC-04.03: filters documents by single tag", async () => {
    const { app } = setupTestApp();

    const response = await app.request("/api/v1/search/documents?tags=Strategy", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(200);
    const body = searchDocumentsResponseSchema.parse(await response.json());
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(2);
    expect(body.data.map((d) => d.id)).toEqual([docStrategy.id, docStrategyAndLegal.id]);
    expect(body.meta).toEqual({ page: 1, limit: 20, total: 2 });
  });

  test("supports tag alias parameter for single tag filter", async () => {
    const { app } = setupTestApp();

    const response = await app.request("/api/v1/search/documents?tag=Strategy", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(200);
    const body = searchDocumentsResponseSchema.parse(await response.json());
    expect(body.data.length).toBe(2);
  });

  test("AC-04.04: filters documents by multi-tag (AND logic) via repeated query params", async () => {
    const { app } = setupTestApp();

    const response = await app.request("/api/v1/search/documents?tags=Strategy&tags=Legal", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(200);
    const body = searchDocumentsResponseSchema.parse(await response.json());
    expect(body.success).toBe(true);
    // Only docStrategyAndLegal has BOTH "strategy" AND "legal"
    expect(body.data.length).toBe(1);
    expect(body.data[0]?.id).toBe(docStrategyAndLegal.id);
    expect(body.meta.total).toBe(1);
  });

  test("AC-04.04: filters documents by multi-tag (AND logic) via comma-separated query param", async () => {
    const { app } = setupTestApp();

    const response = await app.request("/api/v1/search/documents?tags=Strategy,Legal", {
      headers: { authorization: "Bearer head-token" },
    });

    expect(response.status).toBe(200);
    const body = searchDocumentsResponseSchema.parse(await response.json());
    expect(body.data.length).toBe(1);
    expect(body.data[0]?.id).toBe(docStrategyAndLegal.id);
  });

  test("returns empty data list when no document matches all filter tags", async () => {
    const { app } = setupTestApp();

    const response = await app.request("/api/v1/search/documents?tags=NonExistentTag", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(200);
    const body = searchDocumentsResponseSchema.parse(await response.json());
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.meta).toEqual({ page: 1, limit: 20, total: 0 });
  });

  test("returns 400 VALIDATION_ERROR when limit exceeds 100", async () => {
    const { app } = setupTestApp();

    const response = await app.request("/api/v1/search/documents?limit=101", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(400);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("returns 400 VALIDATION_ERROR when tag length exceeds 50 chars", async () => {
    const { app } = setupTestApp();
    const tooLongTag = "x".repeat(51);

    const response = await app.request(`/api/v1/search/documents?tags=${tooLongTag}`, {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(400);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
