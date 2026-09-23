import { describe, expect, test } from "bun:test";
import { createLogger } from "@axentra/observability";
import {
  apiErrorSchema,
  checkDuplicateSuccessResponseSchema,
  uploadDocumentSuccessResponseSchema,
  DOCUMENT_COPY,
  DOCUMENT_ERROR_CODES,
} from "@axentra/shared";
import type { StorageAdapter } from "@axentra/storage";
import { ConflictError } from "../../http/errors";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { createDocumentService } from "./documents.service";
import { computeSha256, InMemoryDocumentContentHashRepository } from "./duplicate.repository";
import {
  DocumentRepository,
  type DocumentBatchDb,
  type DocumentBatchTx,
  type IDocumentRepository,
} from "./documents.repository";

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
      const json = apiErrorSchema.parse(await response.json());
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
      const json = apiErrorSchema.parse(await response.json());
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
      const json = apiErrorSchema.parse(await response.json());
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
      const json = uploadDocumentSuccessResponseSchema.parse(await response.json());
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
      const json = apiErrorSchema.parse(await response.json());
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
      const json = checkDuplicateSuccessResponseSchema.parse(await response.json());
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
      const json = checkDuplicateSuccessResponseSchema.parse(await response.json());
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
      const json = checkDuplicateSuccessResponseSchema.parse(await response.json());
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
      const json = apiErrorSchema.parse(await response.json());
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
      const dupJson = checkDuplicateSuccessResponseSchema.parse(await dupResponse.json());
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
      const newJson = checkDuplicateSuccessResponseSchema.parse(await newResponse.json());
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
      const json = apiErrorSchema.parse(await response.json());
      expect(json.error.code).toBe("VALIDATION_ERROR");
      expect(json.error.message).toBe(
        "Permintaan harus menggunakan format application/json atau multipart/form-data",
      );
    });

    test("proves check-duplicate route defaults to defaultTokenVerifier when tokenVerifier is omitted (F1)", async () => {
      const app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        documentService: createDocumentService(),
      });

      // Bearer token provided, but defaultTokenVerifier always returns null -> 401 UNAUTHORIZED
      const response = await app.request("/api/v1/documents/check-duplicate", {
        method: "POST",
        headers: {
          authorization: "Bearer some-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contentHash: "a".repeat(64),
        }),
      });

      expect(response.status).toBe(401);
      const json = apiErrorSchema.parse(await response.json());
      expect(json.error.code).toBe("UNAUTHORIZED");
      expect(json.error.message).toBe("Token tidak valid atau telah kedaluwarsa");
    });

    test("rejects multipart check-duplicate with Content-Length exceeding 50MB (F2)", async () => {
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
          "content-type": "multipart/form-data; boundary=----boundary",
          "content-length": (50 * 1024 * 1024 + 1).toString(),
        },
        body: "dummy body",
      });

      expect(response.status).toBe(413);
      const json = apiErrorSchema.parse(await response.json());
      expect(json.error.code).toBe("PAYLOAD_TOO_LARGE");
      expect(json.error.message).toBe("Ukuran file melebihi batas maksimum");
    });

    test("rejects multipart check-duplicate with empty file (F2)", async () => {
      const app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        documentService: createDocumentService(),
        tokenVerifier: testTokenVerifier,
      });

      const emptyFormData = new FormData();
      emptyFormData.append("file", new Blob([], { type: "application/pdf" }), "empty.pdf");

      const response = await app.request("/api/v1/documents/check-duplicate", {
        method: "POST",
        headers: MEMBER_AUTH,
        body: emptyFormData,
      });

      expect(response.status).toBe(400);
      const json = apiErrorSchema.parse(await response.json());
      expect(json.error.code).toBe("VALIDATION_ERROR");
      expect(json.error.message).toBe("File tidak boleh kosong");
    });

    test("rejects streaming multipart check-duplicate without Content-Length exceeding 50MB mid-stream (F2)", async () => {
      const app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        documentService: createDocumentService(),
        tokenVerifier: testTokenVerifier,
      });

      const boundary = "----WebKitFormBoundaryChunkedTest";
      const headerPart =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="large.pdf"\r\n` +
        `Content-Type: application/pdf\r\n\r\n`;
      const headerBytes = new TextEncoder().encode(headerPart);

      const chunk5Mb = new Uint8Array(5 * 1024 * 1024);
      let chunksSent = 0;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(headerBytes);
        },
        pull(controller) {
          if (chunksSent < 11) {
            controller.enqueue(chunk5Mb);
            chunksSent++;
          } else {
            controller.close();
          }
        },
      });

      const response = await app.request("/api/v1/documents/check-duplicate", {
        method: "POST",
        headers: {
          ...MEMBER_AUTH,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body: stream,
        duplex: "half",
      });

      expect(response.status).toBe(413);
      const json = apiErrorSchema.parse(await response.json());
      expect(json.error.code).toBe("PAYLOAD_TOO_LARGE");
      expect(json.error.message).toBe("Ukuran file melebihi batas maksimum");
    });

    test("DocumentRepository.saveDocumentBatch maps unique constraint error to 409 DUPLICATE_DOCUMENT (F3/F4)", async () => {
      const mockDb: DocumentBatchDb = {
        transaction: async (callback) => {
          const fakeTx: DocumentBatchTx = {
            select: () => ({
              from: () => ({
                where: async () => [],
              }),
            }),
            insert: () => ({
              values: async () => {
                const err = new Error(
                  'duplicate key value violates unique constraint "document_content_hashes_hash_algo_unique_idx"',
                );
                Object.assign(err, { code: "23505" });
                throw err;
              },
            }),
          };
          return callback(fakeTx);
        },
      };

      const repo = new DocumentRepository(mockDb);

      await expect(
        repo.saveDocumentBatch([
          {
            id: crypto.randomUUID(),
            title: "doc.pdf",
            storageKey: "documents/key/doc.pdf",
            originalName: "doc.pdf",
            mimeType: "application/pdf",
            fileSize: 100,
            fileExtension: "pdf",
            contentHash: "a".repeat(64),
            hashAlgorithm: "sha256",
          },
        ]),
      ).rejects.toThrow("File ini sudah ada");
    });

    test("compensates and removes uploaded file from storage when saveDocumentBatch fails with ConflictError (F6)", async () => {
      const storedObjects = new Map<string, Uint8Array>();
      const putKeys: string[] = [];
      const removedKeys: string[] = [];
      const trackingStorage: StorageAdapter = {
        initialize: async () => {},
        checkHealth: async () => {},
        putObject: async (input) => {
          putKeys.push(input.key);
          const bytes =
            typeof input.body === "string" ? new TextEncoder().encode(input.body) : input.body;
          storedObjects.set(input.key, bytes);
        },
        getObject: async (key: string) => {
          const body = storedObjects.get(key);
          if (!body) throw new Error(`Object not found in storage: ${key}`);
          return body;
        },
        deleteObject: async (key: string) => {
          removedKeys.push(key);
          storedObjects.delete(key);
        },
        headObject: async (key: string) => {
          const body = storedObjects.get(key);
          if (!body) throw new Error(`Object not found in storage: ${key}`);
          return {
            key,
            contentLength: body.length,
            contentType: "application/pdf",
            checksumSha256: undefined,
          };
        },
        createDownloadUrl: async () => "https://example.com",
        close: async () => {},
      };

      const throwingRepo: IDocumentRepository = {
        findExistingHashes: async () => new Set(),
        listRecentDocuments: async () => ({ items: [], meta: { page: 1, limit: 20, total: 0 } }),
        findDocumentById: async () => null,
        findDocumentFileByDocumentId: async () => null,
        saveDocumentBatch: async () => {
          throw new ConflictError(
            DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT,
            DOCUMENT_COPY.DUPLICATE_WARNING,
          );
        },
      };

      const service = createDocumentService({
        repository: throwingRepo,
        storage: trackingStorage,
      });

      const pdfBytes = createPdf("test compensation");
      await expect(
        service.uploadDocuments([
          {
            bytes: pdfBytes,
            filename: "compensate.pdf",
            mimeType: "application/pdf",
            size: pdfBytes.length,
          },
        ]),
      ).rejects.toThrow("File ini sudah ada");

      // Verify that putObject actually populated storage before the repository failure
      expect(putKeys.length).toBe(1);
      expect(putKeys[0]).toContain("compensate.pdf");
      const uploadedKey = putKeys[0];
      expect(uploadedKey).toBeDefined();
      if (!uploadedKey) throw new Error("Expected uploaded key to be defined");

      // Verify that compensation executed deleteObject for the exact uploaded key
      expect(removedKeys.length).toBe(1);
      expect(removedKeys[0]).toBe(uploadedKey);

      // Verify that the object was truly removed from storage (not left orphaned)
      expect(storedObjects.has(uploadedKey)).toBe(false);
      await expect(trackingStorage.headObject(uploadedKey)).rejects.toThrow(
        "Object not found in storage",
      );
    });
  });
});
