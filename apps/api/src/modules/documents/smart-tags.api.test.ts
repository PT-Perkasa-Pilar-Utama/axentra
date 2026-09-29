import { describe, expect, it } from "bun:test";
import { createLogger } from "@axentra/observability";
import type { ApiErrorEnvelope, ApiSuccessEnvelope, SmartTag } from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { createDocumentService } from "./documents.service";
import { InMemoryDocumentSmartTagsRepository } from "./smart-tags.repository";

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

describe("GET /api/v1/documents/:id/smart-tags - Task BE-S2-01 (AC-04.02)", () => {
  const repository = new InMemoryDocumentSmartTagsRepository();
  const documentService = createDocumentService({
    smartTagsRepository: repository,
  });

  const app = createApp({
    logger: testLogger,
    version: "0.1.0",
    readinessChecks: [],
    tokenVerifier,
    documentService,
  });

  const existingDocId = "11111111-1111-4111-8111-111111111111";
  const docWithoutTagsId = "22222222-2222-4222-8222-222222222222";
  const nonExistentDocId = "99999999-9999-4999-8999-999999999999";

  // Setup test documents
  repository.addDocument({
    id: existingDocId,
    title: "Laporan Strategi Keuangan 2026.pdf",
    processingStatus: "completed",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  repository.addDocument({
    id: docWithoutTagsId,
    title: "Dokumen Tanpa Tag.pdf",
    processingStatus: "queued",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Save tags for existingDocId
  repository.saveDocumentSmartTags(existingDocId, [
    "strategy",
    "finance",
    "reporting",
    "overflow-tag", // Capped at 3
  ]);

  describe("Authentication & RBAC", () => {
    it("rejects unauthenticated request with 401 Unauthorized", async () => {
      const response = await app.request(`/api/v1/documents/${existingDocId}/smart-tags`, {
        method: "GET",
      });

      expect(response.status).toBe(401);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects invalid Bearer token with 401 Unauthorized", async () => {
      const response = await app.request(`/api/v1/documents/${existingDocId}/smart-tags`, {
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

    it("rejects non-permitted roles with 403 Forbidden", async () => {
      const response = await app.request(`/api/v1/documents/${existingDocId}/smart-tags`, {
        method: "GET",
        headers: {
          authorization: "Bearer unauthorized-role-token",
        },
      });

      expect(response.status).toBe(403);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("FORBIDDEN");
    });

    it("allows member_team to retrieve document smart tags", async () => {
      const response = await app.request(`/api/v1/documents/${existingDocId}/smart-tags`, {
        method: "GET",
        headers: {
          authorization: "Bearer valid-member-token",
        },
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as ApiSuccessEnvelope<ReadonlyArray<SmartTag>>;
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBe(3);
      expect(json.data.map((t) => t.name)).toEqual(["strategy", "finance", "reporting"]);
    });

    it("allows head_of_team to retrieve document smart tags", async () => {
      const response = await app.request(`/api/v1/documents/${existingDocId}/smart-tags`, {
        method: "GET",
        headers: {
          authorization: "Bearer valid-head-token",
        },
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as ApiSuccessEnvelope<ReadonlyArray<SmartTag>>;
      expect(json.success).toBe(true);
      expect(json.data.length).toBe(3);
    });
  });

  describe("Input Validation", () => {
    it("rejects non-UUID document ID with 400 Bad Request", async () => {
      const response = await app.request("/api/v1/documents/not-a-valid-uuid/smart-tags", {
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
      const response = await app.request(`/api/v1/documents/${nonExistentDocId}/smart-tags`, {
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
  });

  describe("AC-04.02: Smart Tags Response Contract", () => {
    it("returns up to 3 Smart Tags for processed document", async () => {
      const response = await app.request(`/api/v1/documents/${existingDocId}/smart-tags`, {
        method: "GET",
        headers: {
          authorization: "Bearer valid-member-token",
        },
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as ApiSuccessEnvelope<ReadonlyArray<SmartTag>>;
      expect(json.success).toBe(true);
      expect(json.data.length).toBeLessThanOrEqual(3);
      for (const tag of json.data) {
        expect(tag.id).toBeDefined();
        expect(tag.name).toBeDefined();
        expect(tag.createdAt).toBeDefined();
      }
    });

    it("returns empty array when document exists but has no smart tags", async () => {
      const response = await app.request(`/api/v1/documents/${docWithoutTagsId}/smart-tags`, {
        method: "GET",
        headers: {
          authorization: "Bearer valid-member-token",
        },
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as ApiSuccessEnvelope<ReadonlyArray<SmartTag>>;
      expect(json.success).toBe(true);
      expect(json.data).toEqual([]);
    });
  });
});
