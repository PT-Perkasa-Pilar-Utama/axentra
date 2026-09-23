import { beforeEach, describe, expect, it, test } from "bun:test";
import { createLogger, type Logger } from "@axentra/observability";
import type { StorageAdapter } from "@axentra/storage";
import {
  DOCUMENT_COPY,
  DOCUMENT_ERROR_CODES,
  PROCESSING_ENQUEUE_FAILURE_MESSAGE,
  documentProcessJobName,
  type ApiErrorEnvelope,
  type ApiSuccessEnvelope,
  type AuthUser,
  type DocumentProcessJob,
  type DocumentUploadAcceptedData,
} from "@axentra/shared";
import type { QueueProducer } from "@axentra/queue";
import { createApp } from "../../app";
import { ConflictError, PayloadTooLargeError, UnsupportedFileTypeError } from "../../http/errors";
import type { TokenVerifier } from "../../middleware/auth";
import { createAuthService } from "../auth/auth.service";
import type { CreateDocumentBatchItem, IDocumentRepository } from "./documents.repository";
import { validateSingleFileConstraints } from "./documents.schema";
import { createDocumentService, DocumentService } from "./documents.service";

const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const TEST_MEMBER: AuthUser = {
  id: "usr-member-1",
  email: "member@axentra.local",
  role: "member_team",
  name: "Member Test",
};

const TEST_HEAD: AuthUser = {
  id: "usr-head-1",
  email: "head@axentra.local",
  role: "head_of_team",
  name: "Head Test",
};

const testTokenVerifier: TokenVerifier = {
  verifyToken(token: string): AuthUser | null {
    if (token === "test-token-member" || token === "member-token") {
      return TEST_MEMBER;
    }
    if (token === "test-token-head" || token === "head-token") {
      return TEST_HEAD;
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

    // Local file header: PK\x03\x04
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

    // Central directory header: PK\x01\x02
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

  // End of central directory record: PK\x05\x06
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

function createValidDocxBuffer(customText = "Valid DOCX body"): Uint8Array {
  return createZipArchive([
    { name: "[Content_Types].xml", content: new TextEncoder().encode("<Types/>") },
    { name: "_rels/.rels", content: new TextEncoder().encode("<Relationships/>") },
    {
      name: "word/document.xml",
      content: new TextEncoder().encode(
        `<w:document><w:body><w:p><w:r><w:t>${customText}</w:t></w:r></w:p></w:body></w:document>`,
      ),
    },
  ]);
}

function createFakeDocxOnlyContentTypes(): Uint8Array {
  return createZipArchive([
    { name: "[Content_Types].xml", content: new TextEncoder().encode("<Types/>") },
  ]);
}

function createGenericZipBuffer(): Uint8Array {
  return createZipArchive([
    { name: "hello.txt", content: new TextEncoder().encode("Hello world") },
  ]);
}

function createPdfBuffer(size = 100, customText = "report"): Uint8Array {
  const header = `%PDF-1.4\n% ${customText}\n`;
  const headerBytes = new TextEncoder().encode(header);
  const buffer = new Uint8Array(Math.max(size, headerBytes.length));
  buffer.set(headerBytes, 0);
  return buffer;
}

function createJpgBuffer(size = 100): Uint8Array {
  const buffer = new Uint8Array(Math.max(size, 10));
  // JPEG SOI: FF D8 FF
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return buffer;
}

function makePdfFile(name = "laporan.pdf", customText = "default content"): File {
  return new File([createPdfBuffer(100, customText)], name, { type: "application/pdf" });
}

function makeDocxFile(name = "dokumen.docx", customText = "default content"): File {
  return new File([createValidDocxBuffer(customText)], name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function createMockStorage(): StorageAdapter & {
  stored: Map<string, { body: Uint8Array | string; contentType: string }>;
  deleted: string[];
  failOnDelete: boolean;
} {
  const stored = new Map<string, { body: Uint8Array | string; contentType: string }>();
  const deleted: string[] = [];

  const storage = {
    stored,
    deleted,
    failOnDelete: false,
    initialize: async () => {},
    checkHealth: async () => {},
    putObject: async (input: {
      key: string;
      body: Uint8Array | string;
      contentType: string;
      checksumSha256?: string;
    }) => {
      stored.set(input.key, { body: input.body, contentType: input.contentType });
    },
    getObject: async (key: string) => {
      const obj = stored.get(key);
      if (!obj) throw new Error("Object not found in mock storage");
      return typeof obj.body === "string" ? Buffer.from(obj.body) : obj.body;
    },
    deleteObject: async (key: string) => {
      if (storage.failOnDelete) {
        throw new Error("Simulated storage delete failure");
      }
      stored.delete(key);
      deleted.push(key);
    },
    headObject: async (key: string) => {
      const obj = stored.get(key);
      if (!obj) throw new Error("Object not found in mock storage");
      return {
        key,
        contentLength: typeof obj.body === "string" ? Buffer.byteLength(obj.body) : obj.body.length,
        contentType: obj.contentType,
        checksumSha256: undefined,
      };
    },
    createDownloadUrl: async (key: string) => `http://mock-storage/${key}`,
    close: async () => {},
  };
  return storage;
}

function createMockRepository(): IDocumentRepository & {
  savedBatches: CreateDocumentBatchItem[][];
  existingHashes: Set<string>;
  failOnSave: boolean;
  failWithUniqueConstraint: boolean;
  markProcessingEnqueueFailed: (
    documentIds: ReadonlyArray<string>,
    errorMessage: string,
  ) => Promise<void>;
} {
  const savedBatches: CreateDocumentBatchItem[][] = [];
  const existingHashes = new Set<string>();

  const repo = {
    savedBatches,
    existingHashes,
    failOnSave: false,
    failWithUniqueConstraint: false,
    findExistingHashes: async (hashes: ReadonlyArray<string>) => {
      const found = new Set<string>();
      for (const h of hashes) {
        if (existingHashes.has(h)) found.add(h);
      }
      return found;
    },
    listRecentDocuments: async () => ({ items: [], meta: { page: 1, limit: 20, total: 0 } }),
    saveDocumentBatch: async (items: ReadonlyArray<CreateDocumentBatchItem>) => {
      if (repo.failWithUniqueConstraint) {
        throw new ConflictError(
          DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT,
          DOCUMENT_COPY.DUPLICATE_WARNING,
        );
      }
      if (repo.failOnSave) {
        throw new Error("Simulated database failure");
      }
      savedBatches.push([...items]);
      for (const item of items) {
        existingHashes.add(item.contentHash);
      }
      return items.map((i) => ({
        documentId: i.id,
        title: i.title,
        originalName: i.originalName,
        storageKey: i.storageKey,
        mimeType: i.mimeType,
        fileSize: i.fileSize,
        fileExtension: i.fileExtension,
        contentHash: i.contentHash,
      }));
    },
    findDocumentById: async () => null,
    findDocumentFileByDocumentId: async () => null,
    markProcessingEnqueueFailed: async () => undefined,
  };
  return repo;
}

function createMockQueue(): QueueProducer & {
  enqueued: Array<{ name: string; data: unknown }>;
} {
  const enqueued: Array<{ name: string; data: unknown }> = [];
  return {
    enqueued,
    enqueueSystemHealthCheck: async () => "job-health",
    enqueueDocumentProcessing: async (data: DocumentProcessJob) => {
      enqueued.push({ name: documentProcessJobName, data });
      return `job-${enqueued.length}`;
    },
    enqueueDocumentProcess: async (data: DocumentProcessJob) => {
      enqueued.push({ name: documentProcessJobName, data });
      return `job-${enqueued.length}`;
    },
    reconcileDocumentProcessing: async (data: DocumentProcessJob) => {
      enqueued.push({ name: documentProcessJobName, data });
      return data.jobId;
    },
    close: async () => {},
  };
}

function createTestApp(verifier: TokenVerifier = testTokenVerifier, service?: DocumentService) {
  return createApp({
    logger: testLogger,
    version: "0.1.0",
    readinessChecks: [],
    documentService: service ?? createDocumentService(),
    tokenVerifier: verifier,
    enableUploadRoute: true,
  });
}

describe("POST /api/v1/documents/upload", () => {
  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const MEMBER_AUTH_HEADER = { authorization: "Bearer test-token-member" };

  describe("Authentication & RBAC (F1)", () => {
    test("rejects unauthenticated request with 401 UNAUTHORIZED", async () => {
      const app = createTestApp();
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([createPdfBuffer()], { type: "application/pdf" }),
        "doc.pdf",
      );

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        body: formData,
      });

      expect(response.status).toBe(401);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("UNAUTHORIZED");
      expect(json.error.message).toBe("Autentikasi diperlukan");
    });

    test("rejects invalid Bearer token with 401 UNAUTHORIZED", async () => {
      const app = createTestApp();
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([createPdfBuffer()], { type: "application/pdf" }),
        "doc.pdf",
      );

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: "Bearer invalid-token-xyz" },
        body: formData,
      });

      expect(response.status).toBe(401);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.code).toBe("UNAUTHORIZED");
      expect(json.error.message).toBe("Token tidak valid atau telah kedaluwarsa");
    });

    test("rejects head_of_team role with 403 FORBIDDEN", async () => {
      const app = createTestApp();
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([createPdfBuffer()], { type: "application/pdf" }),
        "doc.pdf",
      );

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: "Bearer test-token-head" },
        body: formData,
      });

      expect(response.status).toBe(403);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("FORBIDDEN");
      expect(json.error.message).toBe("Anda tidak memiliki akses untuk tindakan ini");
    });

    test("strictly rejects unsigned Base64 JSON token forgery on production verifier with 401", async () => {
      const productionApp = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        documentService: createDocumentService(),
        enableUploadRoute: true,
      });

      const forgedPayload = Buffer.from(
        JSON.stringify({
          id: "usr-attacker-1",
          email: "attacker@axentra.local",
          role: "member_team",
        }),
      ).toString("base64url");

      const formData = new FormData();
      formData.append(
        "file",
        new Blob([createPdfBuffer()], { type: "application/pdf" }),
        "doc.pdf",
      );

      const response = await productionApp.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: `Bearer ${forgedPayload}` },
        body: formData,
      });

      expect(response.status).toBe(401);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("AC-01.03: Reject unsupported file types & MIME policy (F2)", () => {
    test("rejects .JPG image upload with 415 and stable error copy 'Tipe file tidak didukung'", async () => {
      const app = createTestApp();
      const formData = new FormData();
      const jpgBlob = new Blob([createJpgBuffer()], { type: "image/jpeg" });
      formData.append("file", jpgBlob, "foto-profil.JPG");

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: MEMBER_AUTH_HEADER,
        body: formData,
      });

      expect(response.status).toBe(415);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("UNSUPPORTED_FILE_TYPE");
      expect(json.error.message).toBe(DOCUMENT_COPY.UNSUPPORTED_TYPE);
    });

    test("rejects lowercase .jpg and .jpeg files", async () => {
      const app = createTestApp();
      const formData = new FormData();
      formData.append("file", new Blob([createJpgBuffer()], { type: "image/jpeg" }), "gambar.jpg");

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: MEMBER_AUTH_HEADER,
        body: formData,
      });

      expect(response.status).toBe(415);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.code).toBe("UNSUPPORTED_FILE_TYPE");
      expect(json.error.message).toBe(DOCUMENT_COPY.UNSUPPORTED_TYPE);
    });

    test("rejects other unsupported extensions (.png, .txt, .exe)", async () => {
      const app = createTestApp();

      for (const ext of ["dokumen.png", "catatan.txt", "payload.exe"]) {
        const formData = new FormData();
        formData.append(
          "file",
          new Blob([new Uint8Array([1, 2, 3, 4])], {
            type: "application/octet-stream",
          }),
          ext,
        );

        const response = await app.request("/api/v1/documents/upload", {
          method: "POST",
          headers: MEMBER_AUTH_HEADER,
          body: formData,
        });

        expect(response.status).toBe(415);
        const json = (await response.json()) as ApiErrorEnvelope;
        expect(json.error.code).toBe("UNSUPPORTED_FILE_TYPE");
        expect(json.error.message).toBe(DOCUMENT_COPY.UNSUPPORTED_TYPE);
      }
    });

    test("rejects file extension spoofing: .pdf extension with JPEG magic bytes", async () => {
      const app = createTestApp();
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([createJpgBuffer()], { type: "application/pdf" }),
        "spoofed.pdf",
      );

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: MEMBER_AUTH_HEADER,
        body: formData,
      });

      expect(response.status).toBe(415);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.code).toBe("UNSUPPORTED_FILE_TYPE");
      expect(json.error.message).toBe(DOCUMENT_COPY.UNSUPPORTED_TYPE);
    });

    test("rejects generic ZIP MIME types (application/zip, application/x-zip-compressed) in schema validation", () => {
      for (const mime of ["application/zip", "application/x-zip-compressed"]) {
        expect(() =>
          validateSingleFileConstraints({
            filename: "doc.docx",
            size: 100,
            mimeType: mime,
            bytes: createValidDocxBuffer(),
          }),
        ).toThrow(UnsupportedFileTypeError);
      }
    });

    test("rejects non-canonical application/x-pdf in schema validation (F5)", () => {
      expect(() =>
        validateSingleFileConstraints({
          filename: "laporan.pdf",
          size: 100,
          mimeType: "application/x-pdf",
          bytes: createPdfBuffer(100),
        }),
      ).toThrow(UnsupportedFileTypeError);
    });

    test("rejects fake DOCX ZIP containing only [Content_Types].xml (missing _rels/.rels and word/document.xml)", async () => {
      const app = createTestApp();
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([createFakeDocxOnlyContentTypes()], { type: DOCX_MIME }),
        "incomplete.docx",
      );

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: MEMBER_AUTH_HEADER,
        body: formData,
      });

      expect(response.status).toBe(415);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.code).toBe("UNSUPPORTED_FILE_TYPE");
      expect(json.error.message).toBe(DOCUMENT_COPY.UNSUPPORTED_TYPE);
    });

    test("rejects generic ZIP renamed to .docx with 415", async () => {
      const app = createTestApp();
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([createGenericZipBuffer()], { type: DOCX_MIME }),
        "archive.docx",
      );

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: MEMBER_AUTH_HEADER,
        body: formData,
      });

      expect(response.status).toBe(415);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.code).toBe("UNSUPPORTED_FILE_TYPE");
      expect(json.error.message).toBe(DOCUMENT_COPY.UNSUPPORTED_TYPE);
    });
  });

  describe("Upload Batch and Size Constraints (F1)", () => {
    test("rejects upload when multiple PDFs are submitted (single-PDF rule)", async () => {
      const app = createTestApp();
      const formData = new FormData();
      formData.append(
        "files",
        new Blob([createPdfBuffer()], { type: "application/pdf" }),
        "doc1.pdf",
      );
      formData.append(
        "files",
        new Blob([createPdfBuffer()], { type: "application/pdf" }),
        "doc2.pdf",
      );

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: MEMBER_AUTH_HEADER,
        body: formData,
      });

      expect(response.status).toBe(400);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.message).toBe(DOCUMENT_COPY.SINGLE_PDF_ONLY);
    });

    test("rejects mixing PDF and DOCX in one upload", async () => {
      const app = createTestApp();
      const formData = new FormData();
      formData.append(
        "files",
        new Blob([createPdfBuffer()], { type: "application/pdf" }),
        "doc.pdf",
      );
      formData.append(
        "files",
        new Blob([createValidDocxBuffer()], { type: DOCX_MIME }),
        "contract.docx",
      );

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: MEMBER_AUTH_HEADER,
        body: formData,
      });

      expect(response.status).toBe(400);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.message).toBe(DOCUMENT_COPY.MIXED_TYPES_NOT_ALLOWED);
    });

    test("rejects empty file (0 bytes)", async () => {
      const app = createTestApp();
      const formData = new FormData();
      formData.append("file", new Blob([], { type: "application/pdf" }), "kosong.pdf");

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: MEMBER_AUTH_HEADER,
        body: formData,
      });

      expect(response.status).toBe(400);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.message).toBe(DOCUMENT_COPY.EMPTY_FILE);
    });

    test("rejects request without any files", async () => {
      const app = createTestApp();
      const formData = new FormData();
      formData.append("other_field", "some_value");

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: MEMBER_AUTH_HEADER,
        body: formData,
      });

      expect(response.status).toBe(400);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.message).toBe("Tidak ada file yang diunggah");
    });

    test("rejects more than 10 DOCX files in a single batch", async () => {
      const app = createTestApp();
      const formData = new FormData();
      for (let i = 1; i <= 11; i++) {
        formData.append(
          "files",
          new Blob([createValidDocxBuffer(`doc-${i}`)], { type: DOCX_MIME }),
          `kontrak-${i}.docx`,
        );
      }

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: MEMBER_AUTH_HEADER,
        body: formData,
      });

      expect(response.status).toBe(400);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.message).toBe(DOCUMENT_COPY.EXCEEDS_DOCX_BATCH_LIMIT);
    });

    test("rejects oversized request early via Content-Length header with 413 before parsing body", async () => {
      const app = createTestApp();
      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: {
          ...MEMBER_AUTH_HEADER,
          "content-type": "multipart/form-data; boundary=----WebKitFormBoundaryXYZ",
          "content-length": (50 * 1024 * 1024 + 1).toString(),
        },
        body: "oversized-dummy-stream",
      });

      expect(response.status).toBe(413);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("PAYLOAD_TOO_LARGE");
      expect(json.error.message).toBe("Ukuran file melebihi batas maksimum");
    });

    test("rejects streaming request without Content-Length header exceeding 50 MB with 413 mid-stream", async () => {
      const app = createTestApp();

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
            // 11 * 5MB = 55MB > 50MB
            controller.enqueue(chunk5Mb);
            chunksSent++;
          } else {
            controller.close();
          }
        },
      });

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: {
          ...MEMBER_AUTH_HEADER,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body: stream,
        duplex: "half",
      });

      expect(response.status).toBe(413);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("PAYLOAD_TOO_LARGE");
      expect(json.error.message).toBe("Ukuran file melebihi batas maksimum");
    });

    test("rejects file exceeding max size limit (50 MB) in schema validation with 413 PAYLOAD_TOO_LARGE", () => {
      expect(() =>
        validateSingleFileConstraints({
          filename: "raksasa.pdf",
          size: 50 * 1024 * 1024 + 1,
          mimeType: "application/pdf",
          bytes: createPdfBuffer(100),
        }),
      ).toThrow(PayloadTooLargeError);
    });

    test("rejects non-multipart content-type", async () => {
      const app = createTestApp();
      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: {
          ...MEMBER_AUTH_HEADER,
          "content-type": "application/json",
        },
        body: JSON.stringify({ file: "test" }),
      });

      expect(response.status).toBe(400);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.message).toContain("multipart/form-data");
    });
  });

  describe("End-to-End Persistence, Queue Enqueue & Duplicate Detection", () => {
    let storage: ReturnType<typeof createMockStorage>;
    let repository: ReturnType<typeof createMockRepository>;
    let queue: ReturnType<typeof createMockQueue>;
    let documentService: DocumentService;
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      storage = createMockStorage();
      repository = createMockRepository();
      queue = createMockQueue();
      documentService = new DocumentService({
        repository,
        storage,
        queue,
        logger: testLogger,
      });
      app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        tokenVerifier: testTokenVerifier,
        documentService,
        enableUploadRoute: true,
      });
    });

    it("accepts a valid PDF from Member Team and returns 200, persists to storage & db, and enqueues job (F3)", async () => {
      const formData = new FormData();
      formData.append("files", makePdfFile("laporan.pdf", "laporan content"));

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: "Bearer member-token" },
        body: formData,
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as ApiSuccessEnvelope<DocumentUploadAcceptedData>;
      expect(json.success).toBe(true);
      expect(json.data.message).toBe(DOCUMENT_COPY.UPLOAD_ACCEPTED);
      expect(json.data.count).toBe(1);
      expect(json.data.files[0]?.filename).toBe("laporan.pdf");
      expect(json.data.files[0]?.documentType).toBe("pdf");

      // Verify persistence in repository
      expect(repository.savedBatches.length).toBe(1);
      const savedItem = repository.savedBatches[0]?.[0];
      expect(savedItem?.originalName).toBe("laporan.pdf");
      expect(savedItem?.fileExtension).toBe("pdf");

      // Verify stored object in storage
      expect(storage.stored.size).toBe(1);
      expect(storage.stored.has(savedItem?.storageKey ?? "")).toBe(true);

      // Verify queue enqueue (F3)
      expect(queue.enqueued.length).toBe(1);
      const queuedJob = queue.enqueued[0];
      expect(queuedJob?.name).toBe(documentProcessJobName);
      const jobData = queuedJob?.data as DocumentProcessJob;
      expect(jobData.schemaVersion).toBe(1);
      expect(jobData.documentId).toBe(savedItem?.id ?? "");
      expect(jobData.jobId).toBe(savedItem?.id ?? "");
      expect(jobData.storageKey).toBe(savedItem?.storageKey ?? "");
    });

    it("returns 503 and records failed status when processing enqueue fails [BE-S1-02]", async () => {
      const failedIds: string[] = [];
      repository.markProcessingEnqueueFailed = async (documentIds) => {
        failedIds.push(...documentIds);
      };
      queue.enqueueDocumentProcessing = async () => {
        throw new Error("redis unavailable");
      };

      const formData = new FormData();
      formData.append("files", makePdfFile("laporan.pdf", "queue failure content"));
      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: "Bearer member-token" },
        body: formData,
      });

      expect(response.status).toBe(503);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe(DOCUMENT_ERROR_CODES.PROCESSING_UNAVAILABLE);
      expect(json.error.message).toBe(PROCESSING_ENQUEUE_FAILURE_MESSAGE);
      expect("data" in json).toBe(false);
      expect(repository.savedBatches.length).toBe(1);
      const failedDocumentId = repository.savedBatches[0]?.[0]?.id;
      if (failedDocumentId === undefined) {
        throw new Error("Expected the failed upload to persist a document id");
      }
      expect(failedIds).toEqual([failedDocumentId]);
      expect(queue.enqueued).toHaveLength(0);
    });

    it("returns 503 when the second DOCX enqueue fails and records only that file [BE-S1-02]", async () => {
      const failedIds: string[] = [];
      repository.markProcessingEnqueueFailed = async (documentIds) => {
        failedIds.push(...documentIds);
      };
      let enqueueCalls = 0;
      queue.enqueueDocumentProcessing = async (data) => {
        enqueueCalls += 1;
        if (enqueueCalls === 2) throw new Error("redis unavailable");
        queue.enqueued.push({ name: documentProcessJobName, data });
        return data.jobId;
      };

      const formData = new FormData();
      formData.append("files", makeDocxFile("satu.docx", "first docx"));
      formData.append("files", makeDocxFile("dua.docx", "second docx"));
      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: "Bearer member-token" },
        body: formData,
      });

      expect(response.status).toBe(503);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.code).toBe(DOCUMENT_ERROR_CODES.PROCESSING_UNAVAILABLE);
      expect(repository.savedBatches[0]?.map((item) => item.originalName)).toEqual([
        "satu.docx",
        "dua.docx",
      ]);
      const firstId = repository.savedBatches[0]?.[0]?.id;
      const secondId = repository.savedBatches[0]?.[1]?.id;
      if (firstId === undefined || secondId === undefined) {
        throw new Error("Expected both document ids");
      }
      expect(failedIds).toEqual([secondId]);
      expect(queue.enqueued.map((job) => (job.data as DocumentProcessJob).documentId)).toEqual([
        firstId,
      ]);
    });

    it("propagates a failed enqueue-status write instead of hiding the document [BE-S1-02]", async () => {
      repository.markProcessingEnqueueFailed = async () => {
        throw new Error("database unavailable");
      };
      queue.enqueueDocumentProcessing = async () => {
        throw new Error("redis unavailable");
      };

      const formData = new FormData();
      formData.append("files", makePdfFile("gagal-status.pdf", "status write failure"));
      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: "Bearer member-token" },
        body: formData,
      });

      expect(response.status).toBe(500);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.code).toBe("INTERNAL_ERROR");
    });

    it("accepts multiple valid DOCX files and returns count and details", async () => {
      const formData = new FormData();
      formData.append("files", makeDocxFile("doc1.docx", "DOCX content 1"));
      formData.append("files", makeDocxFile("doc2.docx", "DOCX content 2"));
      formData.append("files", makeDocxFile("doc3.docx", "DOCX content 3"));

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: "Bearer member-token" },
        body: formData,
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as ApiSuccessEnvelope<DocumentUploadAcceptedData>;
      expect(json.success).toBe(true);
      expect(json.data.count).toBe(3);
      expect(json.data.files.length).toBe(3);
      expect(repository.savedBatches[0]?.length).toBe(3);
      expect(storage.stored.size).toBe(3);
      expect(queue.enqueued.length).toBe(3);
    });

    it("accepts upload with singular 'file' field name", async () => {
      const formData = new FormData();
      formData.append("file", makePdfFile("single.pdf"));

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: "Bearer member-token" },
        body: formData,
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as ApiSuccessEnvelope<DocumentUploadAcceptedData>;
      expect(json.data.count).toBe(1);
    });

    it("rejects duplicate upload with 409 and does not persist duplicate", async () => {
      const pdf = makePdfFile("laporan-keuangan.pdf", "exact same report content");

      // First upload succeeds
      const form1 = new FormData();
      form1.append("files", pdf);
      const res1 = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: "Bearer member-token" },
        body: form1,
      });
      expect(res1.status).toBe(200);
      expect(storage.stored.size).toBe(1);
      expect(repository.savedBatches.length).toBe(1);

      // Second upload with identical content fails
      const form2 = new FormData();
      form2.append("files", makePdfFile("salinan-laporan.pdf", "exact same report content"));
      const res2 = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: "Bearer member-token" },
        body: form2,
      });

      expect(res2.status).toBe(409);
      const json = (await res2.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe(DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT);
      expect(json.error.message).toBe(DOCUMENT_COPY.DUPLICATE_WARNING);

      // Verify no duplicate persisted in repository or storage
      expect(repository.savedBatches.length).toBe(1);
      expect(storage.stored.size).toBe(1);
    });

    it("rejects duplicates within the same upload batch with 409", async () => {
      const formData = new FormData();
      formData.append("files", makeDocxFile("doc1.docx", "identical content"));
      formData.append("files", makeDocxFile("doc2.docx", "identical content"));

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: "Bearer member-token" },
        body: formData,
      });

      expect(response.status).toBe(409);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.error.code).toBe(DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT);
      expect(storage.stored.size).toBe(0);
      expect(repository.savedBatches.length).toBe(0);
    });

    it("allows non-duplicate upload when another document exists", async () => {
      // First file uploaded
      const form1 = new FormData();
      form1.append("files", makePdfFile("laporan-keuangan.pdf", "financial report"));
      const res1 = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: "Bearer member-token" },
        body: form1,
      });
      expect(res1.status).toBe(200);

      // Second non-duplicate file uploaded
      const form2 = new FormData();
      form2.append("files", makePdfFile("presentasi-baru.pdf", "new presentation"));
      const res2 = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: "Bearer member-token" },
        body: form2,
      });

      expect(res2.status).toBe(200);
      const json = (await res2.json()) as ApiSuccessEnvelope<DocumentUploadAcceptedData>;
      expect(json.success).toBe(true);
      expect(json.data.message).toBe(DOCUMENT_COPY.UPLOAD_ACCEPTED);
      expect(repository.savedBatches.length).toBe(2);
      expect(storage.stored.size).toBe(2);
    });

    it("maps concurrent unique constraint race (23505) to 409 and rolls back storage (F4)", async () => {
      repository.failWithUniqueConstraint = true;

      const formData = new FormData();
      formData.append("files", makePdfFile("racing-doc.pdf", "race content"));

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: "Bearer member-token" },
        body: formData,
      });

      expect(response.status).toBe(409);
      const json = (await response.json()) as ApiErrorEnvelope;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe(DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT);
      expect(json.error.message).toBe(DOCUMENT_COPY.DUPLICATE_WARNING);

      // Ensure storage rollback occurred
      expect(storage.stored.size).toBe(0);
      expect(storage.deleted.length).toBe(1);
    });

    it("deletes uploaded storage objects if repository transaction fails (Compensating Rollback)", async () => {
      repository.failOnSave = true;

      const formData = new FormData();
      formData.append("files", makePdfFile());

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: "Bearer member-token" },
        body: formData,
      });

      expect(response.status).toBe(500);
      // All uploaded keys must be deleted via compensation
      expect(storage.stored.size).toBe(0);
      expect(storage.deleted.length).toBe(1);
    });

    it("logs error when compensating storage rollback delete fails (F5)", async () => {
      repository.failOnSave = true;
      storage.failOnDelete = true;

      const loggedErrors: Array<{ obj: unknown; msg?: string | undefined }> = [];
      const spyLogger: Logger = {
        ...testLogger,
        child: () => spyLogger,
        error: (obj: unknown, msg?: string | undefined) => {
          loggedErrors.push({ obj, msg });
        },
      } as unknown as Logger;

      const failingService = new DocumentService({
        repository,
        storage,
        queue,
        logger: spyLogger,
      });

      const spyApp = createApp({
        logger: spyLogger,
        version: "0.1.0",
        readinessChecks: [],
        tokenVerifier: testTokenVerifier,
        documentService: failingService,
        enableUploadRoute: true,
      });

      const formData = new FormData();
      formData.append("files", makePdfFile());

      const response = await spyApp.request("/api/v1/documents/upload", {
        method: "POST",
        headers: { authorization: "Bearer member-token" },
        body: formData,
      });

      expect(response.status).toBe(500);
      const rollbackLog = loggedErrors.find((e) =>
        e.msg?.includes("Failed to clean up orphaned storage object"),
      );
      expect(rollbackLog).toBeDefined();
    });
  });

  describe("Production Route Registration & AuthService Integration", () => {
    test("registers /api/v1/documents/upload in production createApp configuration when authService and documentService are injected", async () => {
      const authService = createAuthService({
        authenticator: (creds) => {
          if (creds.email === "member@axentra.local" && creds.password === "correct-password") {
            return {
              id: "usr-prod-member",
              email: "member@axentra.local",
              role: "member_team",
              name: "Production Member",
            };
          }
          return null;
        },
      });

      // Production server.ts configuration does NOT inject documentService until BE-S1-02 is ready
      const app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        authService,
      });

      // Unauthenticated call returns 404 (route is not exposed at all in production)
      const unauthResponse = await app.request("/api/v1/documents/upload", {
        method: "POST",
      });
      expect(unauthResponse.status).toBe(404);

      // Authenticated call also returns 404 (prevents false-success/data-loss path)
      const loginResult = await authService.login({
        email: "member@axentra.local",
        password: "correct-password",
      });
      const authResponse = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: {
          authorization: `Bearer ${loginResult.token}`,
        },
      });
      expect(authResponse.status).toBe(404);
    });

    test("mounts upload route and applies authentication/RBAC when documentService is injected for BE-S1-02", async () => {
      const authService = createAuthService({
        authenticator: (creds) => {
          if (creds.email === "member@axentra.local") {
            return {
              id: "usr-member",
              email: "member@axentra.local",
              role: "member_team",
              name: "Member Team",
            };
          }
          if (creds.email === "head@axentra.local") {
            return {
              id: "usr-head",
              email: "head@axentra.local",
              role: "head_of_team",
              name: "Head of Team",
            };
          }
          return null;
        },
      });

      const documentService = createDocumentService();
      const app = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        authService,
        documentService,
        enableUploadRoute: true,
      });

      // 1. Without authentication: Route is registered and protected (returns 401, not 404)
      const unauthResponse = await app.request("/api/v1/documents/upload", {
        method: "POST",
      });
      expect(unauthResponse.status).toBe(401);

      // 2. With head_of_team token: returns 403 Forbidden
      const headLogin = await authService.login({
        email: "head@axentra.local",
        password: "any",
      });
      const headResponse = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: {
          authorization: `Bearer ${headLogin.token}`,
        },
      });
      expect(headResponse.status).toBe(403);

      // 3. With member_team token but missing multipart body: reaches handler and returns 400
      const memberLogin = await authService.login({
        email: "member@axentra.local",
        password: "any",
      });
      const memberResponse = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: {
          authorization: `Bearer ${memberLogin.token}`,
        },
      });
      expect(memberResponse.status).toBe(400);
    });
  });
});
