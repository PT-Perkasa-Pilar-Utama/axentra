import { describe, expect, it } from "bun:test";
import { createLogger } from "@axentra/observability";
import type { ApiErrorEnvelope, ApiSuccessEnvelope, CategorySummary } from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { createDocumentService } from "./documents.service";
import { InMemoryDocumentCategoryRepository } from "./category.repository";

const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const tokenVerifier: TokenVerifier = {
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
    if (token === "unauthorized-role-token") {
      return {
        id: "usr-other-1",
        email: "other@axentra.local",
        role: "guest" as unknown as "member_team",
        name: "Guest User",
      };
    }
    return null;
  },
};

describe("GET /api/v1/documents/:id/category - Task BE-S2-04 (US-05 / AC-05.01)", () => {
  const repository = new InMemoryDocumentCategoryRepository();
  const documentService = createDocumentService({
    categoryRepository: repository,
  });

  const app = createApp({
    logger: testLogger,
    version: "0.1.0",
    readinessChecks: [],
    tokenVerifier,
    documentService,
  });

  const docWithCategoryId = "11111111-1111-4111-8111-111111111111";
  const docWithoutCategoryId = "22222222-2222-4222-8222-222222222222";
  const deletedDocId = "33333333-3333-4333-8333-333333333333";
  const nonExistentDocId = "99999999-9999-4999-8999-999999999999";
  const categoryId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  const reportingCategory: CategorySummary = {
    id: categoryId,
    name: "Reporting",
    slug: "reporting",
    downloadEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  repository.categories.set(categoryId, reportingCategory);

  repository.documents.set(docWithCategoryId, {
    id: docWithCategoryId,
    categoryId,
  });

  repository.documents.set(docWithoutCategoryId, {
    id: docWithoutCategoryId,
    categoryId: null,
  });

  repository.documents.set(deletedDocId, {
    id: deletedDocId,
    categoryId,
    deletedAt: new Date(),
  });

  it("returns 200 with category data when document has an assigned category", async () => {
    const res = await app.request(`/api/v1/documents/${docWithCategoryId}/category`, {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-member-token",
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessEnvelope<CategorySummary>;
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(categoryId);
    expect(body.data.name).toBe("Reporting");
    expect(body.data.slug).toBe("reporting");
    expect(body.data.downloadEnabled).toBe(false);
  });

  it("returns 200 with data: null when document exists but has no category", async () => {
    const res = await app.request(`/api/v1/documents/${docWithoutCategoryId}/category`, {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-member-token",
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessEnvelope<CategorySummary | null>;
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
  });

  it("allows access for head_of_team role", async () => {
    const res = await app.request(`/api/v1/documents/${docWithCategoryId}/category`, {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-head-token",
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessEnvelope<CategorySummary>;
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Reporting");
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await app.request(`/api/v1/documents/${docWithCategoryId}/category`, {
      method: "GET",
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiErrorEnvelope;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when user has an unauthorized role", async () => {
    const res = await app.request(`/api/v1/documents/${docWithCategoryId}/category`, {
      method: "GET",
      headers: {
        Authorization: "Bearer unauthorized-role-token",
      },
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as ApiErrorEnvelope;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 400 when document id is not a valid UUID", async () => {
    const res = await app.request("/api/v1/documents/not-a-uuid/category", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-member-token",
      },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorEnvelope;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when document does not exist", async () => {
    const res = await app.request(`/api/v1/documents/${nonExistentDocId}/category`, {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-member-token",
      },
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiErrorEnvelope;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Dokumen tidak ditemukan");
  });

  it("returns 404 when document is soft-deleted", async () => {
    const res = await app.request(`/api/v1/documents/${deletedDocId}/category`, {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-member-token",
      },
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiErrorEnvelope;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Dokumen tidak ditemukan");
  });
});
