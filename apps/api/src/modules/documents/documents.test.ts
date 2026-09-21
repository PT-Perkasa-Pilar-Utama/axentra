import { describe, expect, test } from "bun:test";
import { createLogger } from "@axentra/observability";
import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  DocumentUploadAcceptedData,
} from "@axentra/shared";
import { createApp } from "../../app";
import { PayloadTooLargeError, UnsupportedFileTypeError } from "../../http/errors";
import type { TokenVerifier } from "../../middleware/auth";
import { validateSingleFileConstraints } from "./documents.schema";
import { createDocumentService } from "./documents.service";

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

function createTestApp(verifier: TokenVerifier = testTokenVerifier) {
  return createApp({
    logger: testLogger,
    version: "0.1.0",
    readinessChecks: [],
    documentService: createDocumentService(),
    tokenVerifier: verifier,
  });
}

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

function createValidDocxBuffer(): Uint8Array {
  return createZipArchive([
    { name: "[Content_Types].xml", content: new TextEncoder().encode("<Types/>") },
    { name: "_rels/.rels", content: new TextEncoder().encode("<Relationships/>") },
    { name: "word/document.xml", content: new TextEncoder().encode("<w:document/>") },
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

function createPdfBuffer(size = 100): Uint8Array {
  const buffer = new Uint8Array(Math.max(size, 10));
  // %PDF-
  buffer[0] = 0x25;
  buffer[1] = 0x50;
  buffer[2] = 0x44;
  buffer[3] = 0x46;
  buffer[4] = 0x2d;
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

describe("POST /api/v1/documents/upload - Task BE-S1-03", () => {
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
      // Create app with default production verifier (no test verifier injected)
      const productionApp = createApp({
        logger: testLogger,
        version: "0.1.0",
        readinessChecks: [],
        documentService: createDocumentService(),
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
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("UNAUTHORIZED");
      expect(json.error.message).toBe("Token tidak valid atau telah kedaluwarsa");
    });
  });

  describe("AC-01.03: Reject unsupported file types such as .JPG & MIME policy (F3)", () => {
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
      expect(json.error.message).toBe("Tipe file tidak didukung");
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
      expect(json.error.message).toBe("Tipe file tidak didukung");
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
        expect(json.error.message).toBe("Tipe file tidak didukung");
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
      expect(json.error.message).toBe("Tipe file tidak didukung");
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
      expect(json.error.message).toBe("Tipe file tidak didukung");
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
      expect(json.error.message).toBe("Tipe file tidak didukung");
    });
  });

  describe("AC-01.01: Single valid PDF upload", () => {
    test("accepts a valid PDF file and returns 'File diterima untuk diproses'", async () => {
      const app = createTestApp();
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([createPdfBuffer()], { type: "application/pdf" }),
        "laporan.pdf",
      );

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: MEMBER_AUTH_HEADER,
        body: formData,
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as ApiSuccessEnvelope<DocumentUploadAcceptedData>;
      expect(json.success).toBe(true);
      expect(json.data.message).toBe("File diterima untuk diproses");
      expect(json.data.count).toBe(1);
      const firstFile = json.data.files[0];
      expect(firstFile?.filename).toBe("laporan.pdf");
      expect(firstFile?.documentType).toBe("pdf");
    });
  });

  describe("AC-01.04: Multiple valid DOCX files upload", () => {
    test("accepts three valid DOCX files simultaneously", async () => {
      const app = createTestApp();
      const formData = new FormData();
      formData.append(
        "files",
        new Blob([createValidDocxBuffer()], { type: DOCX_MIME }),
        "kontrak-a.docx",
      );
      formData.append(
        "files",
        new Blob([createValidDocxBuffer()], { type: DOCX_MIME }),
        "kontrak-b.docx",
      );
      formData.append(
        "files",
        new Blob([createValidDocxBuffer()], { type: DOCX_MIME }),
        "kontrak-c.docx",
      );

      const response = await app.request("/api/v1/documents/upload", {
        method: "POST",
        headers: MEMBER_AUTH_HEADER,
        body: formData,
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as ApiSuccessEnvelope<DocumentUploadAcceptedData>;
      expect(json.success).toBe(true);
      expect(json.data.message).toBe("File diterima untuk diproses");
      expect(json.data.count).toBe(3);
      expect(json.data.files).toHaveLength(3);
      expect(json.data.files[0]?.documentType).toBe("docx");
      expect(json.data.files[1]?.documentType).toBe("docx");
      expect(json.data.files[2]?.documentType).toBe("docx");
    });
  });

  describe("Upload batch and size constraints (F2)", () => {
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
      expect(json.error.message).toBe("Hanya satu file PDF yang dapat diunggah");
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
      expect(json.error.message).toBe("Tidak dapat mengunggah file PDF dan DOCX secara bersamaan");
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
      expect(json.error.message).toBe("File tidak boleh kosong");
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
          new Blob([createValidDocxBuffer()], { type: DOCX_MIME }),
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
      expect(json.error.message).toBe("Maksimal 10 file DOCX yang dapat diunggah sekaligus");
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

      // Create a chunked stream without content-length that exceeds 50 MB
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
});
