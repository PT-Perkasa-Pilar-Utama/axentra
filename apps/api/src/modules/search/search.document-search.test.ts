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

const doc1: SearchDocument = {
  id: "11111111-1111-4111-8111-111111111111",
  filename: "laporan-keuangan-2026.pdf",
  processingStatus: "completed",
  createdAt: "2026-09-22T02:00:00.000Z",
  snippet: null,
};

const doc2: SearchDocument = {
  id: "22222222-2222-4222-8222-222222222222",
  filename: "spesifikasi-arsitektur.docx",
  processingStatus: "completed",
  createdAt: "2026-09-23T02:00:00.000Z",
  snippet: null,
};

const doc3: SearchDocument = {
  id: "33333333-3333-4333-8333-333333333333",
  filename: "panduan-keamanan.pdf",
  processingStatus: "completed",
  createdAt: "2026-09-24T02:00:00.000Z",
  snippet: null,
};

function setupSearchTestApp() {
  const repository = new InMemorySearchRepository();
  repository.addDocument(doc1, {
    title: "Laporan Keuangan Tahunan",
    extractedText:
      "Laporan audit keuangan perkasa tahun buku 2026 menunjukkan peningkatan efisiensi operasional.",
    tags: ["finance", "reporting"],
    categoryId: "aaaa1111-1111-4111-8111-111111111111",
  });
  repository.addDocument(doc2, {
    title: "Spesifikasi Arsitektur Sistem",
    extractedText:
      "Arsitektur backend Axentra menyediakan REST API dengan performa tinggi dan integrasi BullMQ.",
    tags: ["tech", "api"],
    categoryId: "bbbb2222-2222-4222-8222-222222222222",
  });
  repository.addDocument(doc3, {
    title: "Panduan Keamanan dan Kebijakan",
    extractedText:
      "Kebijakan otorisasi dokumen menerapkan role-based access control dan verifikasi token.",
    tags: ["security"],
    categoryId: "aaaa1111-1111-4111-8111-111111111111",
  });

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

describe("GET /api/v1/search/documents — BE-S2-05 Document Search (AC-06.01 to AC-06.04)", () => {
  test("AC-06.01: finds document by extracted content keyword (q=API)", async () => {
    const { app } = setupSearchTestApp();

    const response = await app.request("/api/v1/search/documents?q=API", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(200);
    const body = searchDocumentsResponseSchema.parse(await response.json());
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0]?.id).toBe(doc2.id);
    expect(body.data[0]?.filename).toBe("spesifikasi-arsitektur.docx");
  });

  test("AC-06.01: finds document by filename keyword", async () => {
    const { app } = setupSearchTestApp();

    const response = await app.request("/api/v1/search/documents?q=keuangan", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(200);
    const body = searchDocumentsResponseSchema.parse(await response.json());
    expect(body.data.length).toBe(1);
    expect(body.data[0]?.id).toBe(doc1.id);
  });

  test("AC-06.01: finds document by title keyword", async () => {
    const { app } = setupSearchTestApp();

    const response = await app.request("/api/v1/search/documents?q=Arsitektur", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(200);
    const body = searchDocumentsResponseSchema.parse(await response.json());
    expect(body.data.length).toBe(1);
    expect(body.data[0]?.id).toBe(doc2.id);
  });

  test("AC-06.02: returns filename and plain text snippet with highlights for matching content (F3)", async () => {
    const { app } = setupSearchTestApp();

    const response = await app.request("/api/v1/search/documents?q=API", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(200);
    const body = searchDocumentsResponseSchema.parse(await response.json());
    expect(body.data.length).toBe(1);

    const item = body.data[0];
    expect(item?.filename).toBe("spesifikasi-arsitektur.docx");
    expect(item?.snippet).not.toBeNull();
    expect(item?.snippet).toContain("API");
    expect(item?.snippet).not.toContain("<strong>"); // Plain text, no raw HTML markup
    expect(item?.highlights).toBeDefined();
    expect(item?.highlights?.length).toBeGreaterThan(0);
  });

  test("AC-06.02: provides non-null snippet and highlights when match is title-only (F1)", async () => {
    const { app, repository } = setupSearchTestApp();
    const titleOnlyDoc: SearchDocument = {
      id: "44444444-4444-4444-8444-444444444444",
      filename: "berkas-umum.pdf",
      processingStatus: "completed",
      createdAt: "2026-09-25T02:00:00.000Z",
      snippet: null,
    };
    repository.addDocument(titleOnlyDoc, {
      title: "Rencana Strategis Perusahaan 2026",
      extractedText: "Isi teks sama sekali tidak memuat kata kunci judul.",
    });

    const response = await app.request("/api/v1/search/documents?q=Strategis", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(200);
    const body = searchDocumentsResponseSchema.parse(await response.json());
    expect(body.data.length).toBe(1);
    expect(body.data[0]?.id).toBe(titleOnlyDoc.id);
    expect(body.data[0]?.snippet).not.toBeNull();
    expect(body.data[0]?.snippet).toContain("Strategis");
    expect(body.data[0]?.highlights).toBeDefined();
    expect(body.data[0]?.highlights?.length).toBeGreaterThan(0);
  });

  test("AC-06.02: provides non-null snippet and highlights when match is filename-only (F1)", async () => {
    const { app, repository } = setupSearchTestApp();
    const filenameOnlyDoc: SearchDocument = {
      id: "55555555-5555-5555-8555-555555555555",
      filename: "anggaran-departemen-it.pdf",
      processingStatus: "completed",
      createdAt: "2026-09-25T03:00:00.000Z",
      snippet: null,
    };
    repository.addDocument(filenameOnlyDoc, {
      title: "Berkas Keuangan",
      extractedText: "Isi dokumen hanya data angka tanpa nama file.",
    });

    const response = await app.request("/api/v1/search/documents?q=anggaran", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(200);
    const body = searchDocumentsResponseSchema.parse(await response.json());
    expect(body.data.length).toBe(1);
    expect(body.data[0]?.id).toBe(filenameOnlyDoc.id);
    expect(body.data[0]?.snippet).not.toBeNull();
    expect(body.data[0]?.snippet).toContain("anggaran");
    expect(body.data[0]?.highlights).toBeDefined();
    expect(body.data[0]?.highlights?.length).toBeGreaterThan(0);
  });

  test("AC-06.02: preserves casing and returns null snippet when search without keyword", async () => {
    const { app } = setupSearchTestApp();

    const response = await app.request("/api/v1/search/documents?tags=tech", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(200);
    const body = searchDocumentsResponseSchema.parse(await response.json());
    expect(body.data.length).toBe(1);
    expect(body.data[0]?.snippet).toBeNull();
  });

  test("AC-06.03: executes search in under 3 seconds (NFR SLA)", async () => {
    const { app } = setupSearchTestApp();

    const start = performance.now();
    const response = await app.request("/api/v1/search/documents?q=keuangan", {
      headers: { authorization: "Bearer member-token" },
    });
    const duration = performance.now() - start;

    expect(response.status).toBe(200);
    expect(duration).toBeLessThan(3000); // Target response under 3 seconds
  });

  test("AC-06.04: returns empty list with total=0 when keyword has no matches (xyzabc)", async () => {
    const { app } = setupSearchTestApp();

    const response = await app.request("/api/v1/search/documents?q=xyzabc", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(200);
    const body = searchDocumentsResponseSchema.parse(await response.json());
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.meta).toEqual({ page: 1, limit: 20, total: 0 });
  });

  test("supports keyword query parameter as alias for q (FE compatibility)", async () => {
    const { app } = setupSearchTestApp();

    const response = await app.request("/api/v1/search/documents?keyword=API", {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(200);
    const body = searchDocumentsResponseSchema.parse(await response.json());
    expect(body.data.length).toBe(1);
    expect(body.data[0]?.id).toBe(doc2.id);
    expect(body.data[0]?.snippet).toContain("API");
    expect(body.data[0]?.snippet).not.toContain("<strong>");
  });

  test("combines keyword search with category filter", async () => {
    const { app } = setupSearchTestApp();

    // Query "keuangan" matches doc1, category bbbb matches doc2 -> empty
    const mismatch = await app.request(
      "/api/v1/search/documents?q=keuangan&categoryId=bbbb2222-2222-4222-8222-222222222222",
      { headers: { authorization: "Bearer member-token" } },
    );
    expect(mismatch.status).toBe(200);
    const mismatchBody = searchDocumentsResponseSchema.parse(await mismatch.json());
    expect(mismatchBody.data.length).toBe(0);

    // Query "keuangan" with matching category -> doc1
    const match = await app.request(
      "/api/v1/search/documents?q=keuangan&categoryId=aaaa1111-1111-4111-8111-111111111111",
      { headers: { authorization: "Bearer member-token" } },
    );
    expect(match.status).toBe(200);
    const matchBody = searchDocumentsResponseSchema.parse(await match.json());
    expect(matchBody.data.length).toBe(1);
    expect(matchBody.data[0]?.id).toBe(doc1.id);
  });

  test("combines keyword search with tag filter", async () => {
    const { app } = setupSearchTestApp();

    // doc2 has q=API and tag=tech
    const match = await app.request("/api/v1/search/documents?q=API&tags=tech", {
      headers: { authorization: "Bearer member-token" },
    });
    expect(match.status).toBe(200);
    const matchBody = searchDocumentsResponseSchema.parse(await match.json());
    expect(matchBody.data.length).toBe(1);
    expect(matchBody.data[0]?.id).toBe(doc2.id);

    // doc2 has q=API but tag=finance -> empty
    const noMatch = await app.request("/api/v1/search/documents?q=API&tags=finance", {
      headers: { authorization: "Bearer member-token" },
    });
    expect(noMatch.status).toBe(200);
    const noMatchBody = searchDocumentsResponseSchema.parse(await noMatch.json());
    expect(noMatchBody.data.length).toBe(0);
  });

  test("returns 400 VALIDATION_ERROR when query exceeds 100 characters", async () => {
    const { app } = setupSearchTestApp();
    const longQuery = "a".repeat(101);

    const response = await app.request(`/api/v1/search/documents?q=${longQuery}`, {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(400);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
