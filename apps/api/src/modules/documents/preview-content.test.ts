import { describe, expect, test } from "bun:test";
import { apiErrorSchema } from "@axentra/shared";
import {
  createMockStorage,
  createPreviewSetup,
  DELETED_DOC_ID,
  DOCX_DOC_ID,
  DOCX_MIME_TYPE,
  DOCX_STORAGE_KEY,
  MISMATCH_DOC_ID,
  MISSING_DOC_ID,
  NO_FILE_DOC_ID,
  PDF_DOC_ID,
  PDF_STORAGE_KEY,
  sampleDocxBytes,
  samplePdfBytes,
  UNICODE_DOC_ID,
  UNSUPPORTED_DOC_ID,
} from "./preview.test-support";

const CONTENT_PATH = "preview/content";
const INTERNAL_MESSAGE = "Terjadi kesalahan pada server";

function contentUrl(documentId: string, query = ""): string {
  return `/api/v1/documents/${documentId}/${CONTENT_PATH}${query}`;
}

async function bytesOf(response: Response): Promise<number[]> {
  return Array.from(new Uint8Array(await response.arrayBuffer()));
}

describe("GET /api/v1/documents/:id/preview/content — BE-S3-01 byte stream", () => {
  describe("Authentication and validation", () => {
    test("rejects unauthenticated request with 401", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(contentUrl(PDF_DOC_ID));

      expect(response.status).toBe(401);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    test("rejects forged or invalid token with 401", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(contentUrl(PDF_DOC_ID), {
        headers: { authorization: "Bearer invalid-token" },
      });

      expect(response.status).toBe(401);
    });

    test("returns 400 when document id is not a valid UUID", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(`/api/v1/documents/not-a-uuid/${CONTENT_PATH}`, {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(400);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Authorization (same rules as the metadata route)", () => {
    test("allows member_team, head_of_team, and admin to stream an active PDF", async () => {
      const { app } = createPreviewSetup();

      for (const token of ["member-token", "head-token", "admin-token"]) {
        const response = await app.request(contentUrl(PDF_DOC_ID), {
          headers: { authorization: `Bearer ${token}` },
        });
        expect(response.status).toBe(200);
        expect(await bytesOf(response)).toEqual(Array.from(samplePdfBytes));
      }
    });

    test("returns 404 for a soft-deleted document", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(contentUrl(DELETED_DOC_ID), {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(404);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("Dokumen tidak ditemukan");
    });

    test("returns 404 for a missing document", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(contentUrl(MISSING_DOC_ID), {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(404);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.message).toBe("Dokumen tidak ditemukan");
    });

    test("returns 404 when the document has no stored file record", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(contentUrl(NO_FILE_DOC_ID), {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(404);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.message).toBe("File dokumen tidak ditemukan");
    });

    test("returns 404 for a stored type the upload does not accept", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(contentUrl(UNSUPPORTED_DOC_ID), {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(404);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.message).toBe("File dokumen tidak ditemukan");
    });
  });

  describe("Response headers and body", () => {
    test("streams PDF bytes inline with the stored content type and hardened headers", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(contentUrl(PDF_DOC_ID), {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-disposition")).toBe(
        `inline; filename="laporan.pdf"; filename*=UTF-8''laporan.pdf`,
      );
      expect(response.headers.get("content-length")).toBe(String(samplePdfBytes.byteLength));
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await bytesOf(response)).toEqual(Array.from(samplePdfBytes));
    });

    test("streams DOCX bytes with the stored DOCX content type", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(contentUrl(DOCX_DOC_ID), {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(DOCX_MIME_TYPE);
      expect(response.headers.get("content-disposition")).toContain("inline;");
      expect(await bytesOf(response)).toEqual(Array.from(sampleDocxBytes));
    });

    test("never exposes the storage key in any response header or body", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(contentUrl(DOCX_DOC_ID), {
        headers: { authorization: "Bearer member-token" },
      });

      const headerDump = [...response.headers.entries()].map(([, value]) => value).join("\n");
      expect(headerDump).not.toContain(DOCX_STORAGE_KEY);
      expect(headerDump).not.toContain("storage/");
      expect(headerDump).not.toContain("https://");
      const bodyText = new TextDecoder().decode(new Uint8Array(await response.arrayBuffer()));
      expect(bodyText).not.toContain("storage/");
    });

    test("encodes non-ASCII filenames with an ASCII fallback and RFC 5987 filename*", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(contentUrl(UNICODE_DOC_ID), {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(200);
      const disposition = response.headers.get("content-disposition") ?? "";
      expect(disposition).toMatch(/^inline; filename="[\x20-\x7e]*"; filename\*=UTF-8''/);
      expect(disposition).toContain(
        "filename*=UTF-8''Laporan%20Keuangan%20%28Final%29%20%C3%A9.pdf",
      );
    });

    test("uses the stored content type and ignores a MIME value sent in the request", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(
        contentUrl(PDF_DOC_ID, "?mimeType=text/html&contentType=text/html"),
        { headers: { authorization: "Bearer member-token" } },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
    });
  });

  describe("Storage integrity and failures", () => {
    test("rejects a stored object whose size does not match the metadata", async () => {
      const { app } = createPreviewSetup();
      const response = await app.request(contentUrl(MISMATCH_DOC_ID), {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(500);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.message).toBe(INTERNAL_MESSAGE);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("content-disposition")).toBeNull();
    });

    test("returns a generic 500 when the storage read fails without leaking the key", async () => {
      const failingStorage = createMockStorage({
        getObject: async () => {
          throw new Error(`S3 read timeout while reading ${PDF_STORAGE_KEY}`);
        },
      });
      const { app } = createPreviewSetup(failingStorage);
      const response = await app.request(contentUrl(PDF_DOC_ID), {
        headers: { authorization: "Bearer member-token" },
      });

      expect(response.status).toBe(500);
      const rawBody = await response.text();
      const body = apiErrorSchema.parse(JSON.parse(rawBody));
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.message).toBe(INTERNAL_MESSAGE);
      expect(rawBody).not.toContain(PDF_STORAGE_KEY);
      expect(rawBody).not.toContain("S3 read timeout");
    });
  });
});
