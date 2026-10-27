import { describe, expect, test } from "bun:test";
import type { StorageAdapter } from "@axentra/storage";
import { apiErrorSchema, previewDocumentSuccessResponseSchema } from "@axentra/shared";
import {
  createMockStorage,
  createPreviewSetup,
  DELETED_DOC_ID,
  DOCX_DOC_ID,
  MISSING_DOC_ID,
  NO_FILE_DOC_ID,
  PDF_DOC_ID,
  samplePdfBytes,
} from "./preview.test-support";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Metadata route only: it must never touch storage, so a storage that fails every call must not matter.
const brokenStorage: StorageAdapter = createMockStorage({
  getObject: async () => {
    throw new Error("storage must not be read by the metadata route");
  },
  createDownloadUrl: async () => {
    throw new Error("storage must not sign URLs for the metadata route");
  },
});

describe("GET /api/v1/documents/:id/preview — metadata only", () => {
  describe("Authentication", () => {
    test("rejects unauthenticated request with 401", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(`/api/v1/documents/${PDF_DOC_ID}/preview`);

      expect(response.status).toBe(401);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    test("rejects forged or invalid token with 401", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(`/api/v1/documents/${PDF_DOC_ID}/preview`, {
        headers: { authorization: "Bearer invalid-token" },
      });

      expect(response.status).toBe(401);
    });
  });

  describe("Validation", () => {
    test("returns 400 when document id is not a valid UUID", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(`/api/v1/documents/not-a-uuid/preview`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(400);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("ID dokumen harus berupa UUID yang valid");
    });
  });

  describe("Preview metadata payload", () => {
    test("returns filename, mimeType, and fileSize for a PDF with no URL field", async () => {
      const { app } = createPreviewSetup(brokenStorage);
      const response = await app.request(`/api/v1/documents/${PDF_DOC_ID}/preview`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(200);
      const rawBody = await response.text();
      const body = previewDocumentSuccessResponseSchema.parse(JSON.parse(rawBody));
      expect(Object.keys(body.data).sort()).toEqual(["fileSize", "filename", "mimeType"]);
      expect(body.data).toEqual({
        filename: "laporan.pdf",
        mimeType: "application/pdf",
        fileSize: samplePdfBytes.byteLength,
      });
      expect(rawBody).not.toContain("previewUrl");
      expect(rawBody).not.toContain("expiresInSeconds");
      expect(rawBody).not.toContain("storage/");
      expect(rawBody).not.toContain("https://");
    });

    test("allows head_of_team and admin to read preview metadata", async () => {
      const { app } = createPreviewSetup();

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
      const { app } = createPreviewSetup();
      const response = await app.request(`/api/v1/documents/${DOCX_DOC_ID}/preview`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(200);
      const body = previewDocumentSuccessResponseSchema.parse(await response.json());
      expect(body.data.filename).toBe("kontrak.docx");
      expect(body.data.mimeType).toBe(DOCX_MIME_TYPE);
    });
  });

  describe("Document and File Not Found", () => {
    test("returns 404 when document does not exist", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(`/api/v1/documents/${MISSING_DOC_ID}/preview`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(404);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("Dokumen tidak ditemukan");
    });

    test("returns 404 when document is soft-deleted", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(`/api/v1/documents/${DELETED_DOC_ID}/preview`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(404);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("NOT_FOUND");
    });

    test("returns 404 when document has no stored file record", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(`/api/v1/documents/${NO_FILE_DOC_ID}/preview`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(404);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.message).toBe("File dokumen tidak ditemukan");
    });
  });
});
