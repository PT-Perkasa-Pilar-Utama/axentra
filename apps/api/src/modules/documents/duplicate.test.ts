import { describe, expect, test } from "bun:test";
import { createLogger } from "@axentra/observability";
import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  CheckDuplicateResponse,
  DocumentUploadAcceptedData,
} from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { createDocumentService } from "./documents.service";
import { computeSha256, InMemoryDocumentContentHashRepository } from "./duplicate.repository";

const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const testTokenVerifier: TokenVerifier = {
  verifyToken(token: string) {
    if (token === "test-token-member") {
      return {
        id: "usr-member-1",
        email: "member@axentra.local",
        role: "member_team",
        name: "Member Test",
      };
    }
    if (token === "test-token-head") {
      return {
        id: "usr-head-1",
        email: "head@axentra.local",
        role: "head_of_team",
        name: "Head Test",
      };
    }
    return null;
  },
};

function createZipArchive(
  entries: ReadonlyArray<{ name: string; content?: Uint8Array }>,
): Uint8Array {
  const localHeaders: Array<Uint8Array> = [];
  const centralHeaders: Array<Uint8Array> = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const content = entry.content ?? new Uint8Array(0);

    const lh = new Uint8Array(30 + nameBytes.length + content.length);
    const lhView = new DataView(lh.buffer);
    lhView.setUint32(0, 0x04034b50, true);
    lhView.setUint16(4, 20, true);
    lhView.setUint16(6, 0, true);
    lhView.setUint16(8, 0, true);
    lhView.setUint32(18, content.length, true);
    lhView.setUint32(22, content.length, true);
    lhView.setUint16(26, nameBytes.length, true);
    lhView.setUint16(28, 0, true);
    lh.set(nameBytes, 30);
    lh.set(content, 30 + nameBytes.length);
    localHeaders.push(lh);

    const ch = new Uint8Array(46 + nameBytes.length);
    const chView = new DataView(ch.buffer);
    chView.setUint32(0, 0x02014b50, true);
    chView.setUint16(4, 20, true);
    chView.setUint16(6, 20, true);
    chView.setUint16(8, 0, true);
    chView.setUint16(10, 0, true);
    chView.setUint32(20, content.length, true);
    chView.setUint32(24, content.length, true);
    chView.setUint16(28, nameBytes.length, true);
    chView.setUint16(30, 0, true);
    chView.setUint16(32, 0, true);
    chView.setUint32(42, offset, true);
    ch.set(nameBytes, 46);
    centralHeaders.push(ch);

    offset += lh.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralDirSize, true);
  eocdView.setUint32(16, centralDirOffset, true);

  const totalLength = offset + centralDirSize + 22;
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const lh of localHeaders) {
    result.set(lh, pos);
    pos += lh.length;
  }
  for (const ch of centralHeaders) {
    result.set(ch, pos);
    pos += ch.length;
  }
  result.set(eocd, pos);
  return result;
}

function createValidDocx(uniqueText = ""): Uint8Array {
  return createZipArchive([
    { name: "[Content_Types].xml", content: new TextEncoder().encode("<Types/>") },
    { name: "_rels/.rels", content: new TextEncoder().encode("<Relationships/>") },
    {
      name: "word/document.xml",
      content: new TextEncoder().encode(`<w:document>${uniqueText}</w:document>`),
    },
  ]);
}

function createPdf(content = "sample pdf content"): Uint8Array {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(content);
  // %PDF- followed by content
  const buffer = new Uint8Array(5 + textBytes.length);
  buffer[0] = 0x25;
  buffer[1] = 0x50;
  buffer[2] = 0x44;
  buffer[3] = 0x46;
  buffer[4] = 0x2d;
  buffer.set(textBytes, 5);
  return buffer;
}

describe("Task BE-S1-04: Duplicate Detection", () => {
  const MEMBER_AUTH = { authorization: "Bearer test-token-member" };
  const HEAD_AUTH = { authorization: "Bearer test-token-head" };
  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  describe("computeSha256 and InMemoryRepository", () => {
    test("computes correct SHA-256 hash", () => {
      const data = new TextEncoder().encode("hello world");
      const hash = computeSha256(data);
      expect(hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
    });

    test("InMemoryDocumentContentHashRepository handles save, find, and conflict", async () => {
      const repo = new InMemoryDocumentContentHashRepository();
      const docId = crypto.randomUUID();
      const hash = computeSha256(new TextEncoder().encode("unique-content"));

      const saved = await repo.saveContentHash({
        documentId: docId,
        contentHash: hash,
      });

      expect(saved.documentId).toBe(docId);
      expect(saved.contentHash).toBe(hash);
      expect(saved.hashAlgorithm).toBe("sha256");

      const found = await repo.findByContentHash(hash);
      expect(found).not.toBeNull();
      expect(found?.documentId).toBe(docId);

      const existingSet = await repo.findExistingHashes([hash, "non-existing"]);
      expect(existingSet.has(hash)).toBe(true);
      expect(existingSet.has("non-existing")).toBe(false);

      // Duplicate save throws
      expect(
        repo.saveContentHash({
          documentId: crypto.randomUUID(),
          contentHash: hash,
        }),
      ).rejects.toThrow("Hash konten sudah ada");
    });
  });

  describe("AC-02.01: Mencoba mengunggah file duplikat", () => {
    test("rejects duplicate file upload with 409 and exact message 'File ini sudah ada'", async () => {
      const hashRepo = new InMemoryDocumentContentHashRepository();
      const existingPdfBytes = createPdf("laporan keuangan 2026");
      const existingHash = computeSha256(existingPdfBytes);
      const existingDocId = crypto.randomUUID();

      await hashRepo.saveContentHash({
        documentId: existingDocId,
        contentHash: existingHash,
      });

      const documentService = createDocumentService({
        contentHashRepository: hashRepo,
      });

      const app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        documentService,
        tokenVerifier: testTokenVerifier,
        enableUploadRoute: true,
      });

      const formData = new FormData();
      formData.append(
        "file",
        new Blob([existingPdfBytes], { type: "application/pdf" }),
        "laporan-keuangan.pdf",
      );

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: MEMBER_AUTH,
        body: formData,
      });

      expect(response.status).toBe(409);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("DUPLICATE_DOCUMENT");
      expect(json.error.message).toBe("File ini sudah ada");
    });

    test("detects duplicate by content hash even when filename is completely different", async () => {
      const hashRepo = new InMemoryDocumentContentHashRepository();
      const pdfBytes = createPdf("dokumen rahasia");
      const hash = computeSha256(pdfBytes);

      await hashRepo.saveContentHash({
        documentId: crypto.randomUUID(),
        contentHash: hash,
      });

      const documentService = createDocumentService({
        contentHashRepository: hashRepo,
      });

      const app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        documentService,
        tokenVerifier: testTokenVerifier,
        enableUploadRoute: true,
      });

      // Uploading with totally different filename: 'nama-berbeda.pdf'
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([pdfBytes], { type: "application/pdf" }),
        "nama-berbeda.pdf",
      );

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: MEMBER_AUTH,
        body: formData,
      });

      expect(response.status).toBe(409);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.code).toBe("DUPLICATE_DOCUMENT");
      expect(json.error.message).toBe("File ini sudah ada");
    });

    test("rejects intra-batch duplicate files in a single multi-file upload", async () => {
      const hashRepo = new InMemoryDocumentContentHashRepository();
      const documentService = createDocumentService({
        contentHashRepository: hashRepo,
      });

      const app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        documentService,
        tokenVerifier: testTokenVerifier,
        enableUploadRoute: true,
      });

      const docxBytes = createValidDocx("same-content");

      const formData = new FormData();
      formData.append("files", new Blob([docxBytes], { type: DOCX_MIME }), "file1.docx");
      formData.append("files", new Blob([docxBytes], { type: DOCX_MIME }), "file2.docx");

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: MEMBER_AUTH,
        body: formData,
      });

      expect(response.status).toBe(409);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.code).toBe("DUPLICATE_DOCUMENT");
      expect(json.error.message).toBe("File ini sudah ada");
    });
  });

  describe("AC-02.02: Memastikan file duplikat tidak tersimpan", () => {
    test("does not persist new content hash when duplicate upload attempt occurs", async () => {
      const hashRepo = new InMemoryDocumentContentHashRepository();
      const originalPdf = createPdf("dokumen asli");
      const originalHash = computeSha256(originalPdf);
      const originalDocId = crypto.randomUUID();

      await hashRepo.saveContentHash({
        documentId: originalDocId,
        contentHash: originalHash,
      });

      const documentService = createDocumentService({
        contentHashRepository: hashRepo,
      });

      const app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        documentService,
        tokenVerifier: testTokenVerifier,
        enableUploadRoute: true,
      });

      const duplicateFormData = new FormData();
      duplicateFormData.append(
        "file",
        new Blob([originalPdf], { type: "application/pdf" }),
        "copy-laporan.pdf",
      );

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: MEMBER_AUTH,
        body: duplicateFormData,
      });

      expect(response.status).toBe(409);

      // Verify repository only has the original hash and original docId
      const record = await hashRepo.findByContentHash(originalHash);
      expect(record?.documentId).toBe(originalDocId);
    });
  });

  describe("AC-02.03: Mengunggah file yang bukan duplikat", () => {
    test("accepts non-duplicate upload when another document exists in the system", async () => {
      const hashRepo = new InMemoryDocumentContentHashRepository();
      const existingPdf = createPdf("laporan keuangan lama");
      await hashRepo.saveContentHash({
        documentId: crypto.randomUUID(),
        contentHash: computeSha256(existingPdf),
      });

      const documentService = createDocumentService({
        contentHashRepository: hashRepo,
      });

      const app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        documentService,
        tokenVerifier: testTokenVerifier,
        enableUploadRoute: true,
      });

      // Different content
      const newPdf = createPdf("presentasi baru");
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([newPdf], { type: "application/pdf" }),
        "presentasi-baru.pdf",
      );

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: MEMBER_AUTH,
        body: formData,
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as ApiSuccessEnvelope<DocumentUploadAcceptedData>;
      expect(json.success).toBe(true);
      expect(json.data.message).toBe("File diterima untuk diproses");
      expect(json.data.count).toBe(1);
    });
  });

  describe("POST /api/v1/documents/check-duplicate endpoint", () => {
    test("rejects unauthenticated request with 401 UNAUTHORIZED", async () => {
      const app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        documentService: createDocumentService(),
        tokenVerifier: testTokenVerifier,
      });

      const response = await app.request("/api/v1/documents/check-duplicate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contentHash: "a".repeat(64),
        }),
      });

      expect(response.status).toBe(401);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    test("allows head_of_team to check duplicate", async () => {
      const app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        documentService: createDocumentService(),
        tokenVerifier: testTokenVerifier,
      });

      const response = await app.request("/api/v1/documents/check-duplicate", {
        method: "POST",
        headers: {
          ...HEAD_AUTH,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contentHash: "b".repeat(64),
        }),
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as ApiSuccessEnvelope<CheckDuplicateResponse>;
      expect(json.success).toBe(true);
      expect(json.data.isDuplicate).toBe(false);
    });

    test("returns isDuplicate: true and warning message when JSON contentHash exists", async () => {
      const hashRepo = new InMemoryDocumentContentHashRepository();
      const existingDocId = crypto.randomUUID();
      const hash = "c".repeat(64);

      await hashRepo.saveContentHash({
        documentId: existingDocId,
        contentHash: hash,
      });

      const app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        documentService: createDocumentService({ contentHashRepository: hashRepo }),
        tokenVerifier: testTokenVerifier,
      });

      const response = await app.request("/api/v1/documents/check-duplicate", {
        method: "POST",
        headers: {
          ...MEMBER_AUTH,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contentHash: hash,
        }),
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as ApiSuccessEnvelope<CheckDuplicateResponse>;
      expect(json.success).toBe(true);
      expect(json.data.isDuplicate).toBe(true);
      expect(json.data.existingDocumentId).toBe(existingDocId);
      expect(json.data.message).toBe("File ini sudah ada");
    });

    test("returns isDuplicate: false when JSON contentHash does not exist", async () => {
      const app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        documentService: createDocumentService(),
        tokenVerifier: testTokenVerifier,
      });

      const response = await app.request("/api/v1/documents/check-duplicate", {
        method: "POST",
        headers: {
          ...MEMBER_AUTH,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contentHash: "d".repeat(64),
        }),
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as ApiSuccessEnvelope<CheckDuplicateResponse>;
      expect(json.success).toBe(true);
      expect(json.data.isDuplicate).toBe(false);
      expect(json.data.existingDocumentId).toBeUndefined();
    });

    test("rejects invalid hash length with 400 Bad Request", async () => {
      const app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        documentService: createDocumentService(),
        tokenVerifier: testTokenVerifier,
      });

      const response = await app.request("/api/v1/documents/check-duplicate", {
        method: "POST",
        headers: {
          ...MEMBER_AUTH,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contentHash: "too-short",
        }),
      });

      expect(response.status).toBe(400);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    test("supports multipart/form-data with uploaded file for preflight duplicate check", async () => {
      const hashRepo = new InMemoryDocumentContentHashRepository();
      const existingPdf = createPdf("surat perjanjian 2026");
      const existingHash = computeSha256(existingPdf);
      const existingDocId = crypto.randomUUID();

      await hashRepo.saveContentHash({
        documentId: existingDocId,
        contentHash: existingHash,
      });

      const app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        documentService: createDocumentService({ contentHashRepository: hashRepo }),
        tokenVerifier: testTokenVerifier,
      });

      // 1. Check existing file
      const dupFormData = new FormData();
      dupFormData.append("file", new Blob([existingPdf], { type: "application/pdf" }), "check.pdf");

      const dupResponse = await app.request("/api/v1/documents/check-duplicate", {
        method: "POST",
        headers: MEMBER_AUTH,
        body: dupFormData,
      });

      expect(dupResponse.status).toBe(200);
      const dupJson = (await dupResponse.json()) as ApiSuccessEnvelope<CheckDuplicateResponse>;
      expect(dupJson.data.isDuplicate).toBe(true);
      expect(dupJson.data.existingDocumentId).toBe(existingDocId);
      expect(dupJson.data.message).toBe("File ini sudah ada");

      // 2. Check brand new file
      const newFormData = new FormData();
      newFormData.append(
        "file",
        new Blob([createPdf("brand new file")], { type: "application/pdf" }),
        "new.pdf",
      );

      const newResponse = await app.request("/api/v1/documents/check-duplicate", {
        method: "POST",
        headers: MEMBER_AUTH,
        body: newFormData,
      });

      expect(newResponse.status).toBe(200);
      const newJson = (await newResponse.json()) as ApiSuccessEnvelope<CheckDuplicateResponse>;
      expect(newJson.data.isDuplicate).toBe(false);
    });

    test("rejects unsupported Content-Type header with 400 Bad Request", async () => {
      const app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        documentService: createDocumentService(),
        tokenVerifier: testTokenVerifier,
      });

      const response = await app.request("/api/v1/documents/check-duplicate", {
        method: "POST",
        headers: {
          ...MEMBER_AUTH,
          "content-type": "text/plain",
        },
        body: "plain text",
      });

      expect(response.status).toBe(400);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.code).toBe("VALIDATION_ERROR");
      expect(json.error.message).toBe(
        "Permintaan harus menggunakan format application/json atau multipart/form-data",
      );
    });
  });
});
