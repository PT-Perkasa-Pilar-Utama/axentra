import { describe, expect, spyOn, test } from "bun:test";
import type { DocumentUploadAcceptedData } from "@axentra/shared";
import {
  DOCUMENT_COPY,
  DOCUMENT_ERROR_CODES,
  DOCUMENT_MIME_ALLOWLIST_BY_TYPE,
  isSupportedDocumentMimeType,
} from "@axentra/shared";
import {
  uploadDocument,
  uploadDocuments,
} from "../src/features/document-upload/document-upload.api";
import {
  classifyUploadError,
  isRecoverableStatus,
  isSupportedFile,
  validateUploadFiles,
  UPLOAD_MESSAGES,
} from "../src/features/document-upload/document-upload.presenter";
import { ApiClientError } from "../src/lib/api-client";

function createMockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit | undefined) => Promise<Response>,
) {
  return Object.assign(handler, {
    preconnect: (
      _url: string | URL,
      _options?: { dns?: boolean; tcp?: boolean; http?: boolean; https?: boolean } | undefined,
    ): void => {},
  });
}

describe("document-upload shared contracts & MIME allowlist (F5)", () => {
  test("maps document types to strict allowed MIME types without generic zip", () => {
    expect(DOCUMENT_MIME_ALLOWLIST_BY_TYPE.pdf).toContain("application/pdf");
    expect(DOCUMENT_MIME_ALLOWLIST_BY_TYPE.docx).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(DOCUMENT_MIME_ALLOWLIST_BY_TYPE.docx).not.toContain("application/zip");
    expect(DOCUMENT_MIME_ALLOWLIST_BY_TYPE.docx).not.toContain("application/x-zip-compressed");
  });

  test("rejects generic zip MIME types", () => {
    expect(isSupportedDocumentMimeType("application/zip")).toBe(false);
    expect(isSupportedDocumentMimeType("application/x-zip-compressed")).toBe(false);
  });
});

describe("document-upload validation (F3)", () => {
  test("AC-01.01: accepts single valid PDF file", () => {
    const pdfFile = { name: "laporan.pdf", type: "application/pdf" };
    expect(isSupportedFile(pdfFile)).toBe(true);

    const result = validateUploadFiles([pdfFile]);
    expect(result.valid).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  test("AC-01.04: accepts multiple DOCX files", () => {
    const docxFiles = [
      {
        name: "doc1.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      {
        name: "doc2.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      {
        name: "doc3.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ];

    for (const f of docxFiles) {
      expect(isSupportedFile(f)).toBe(true);
    }

    const result = validateUploadFiles(docxFiles);
    expect(result.valid).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  test("rejects multiple PDF files with single PDF policy", () => {
    const pdfFiles = [
      { name: "laporan1.pdf", type: "application/pdf" },
      { name: "laporan2.pdf", type: "application/pdf" },
    ];
    const result = validateUploadFiles(pdfFiles);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toBe(DOCUMENT_COPY.SINGLE_PDF_ONLY);
    expect(result.errorMessage).toBe("Hanya satu file PDF yang dapat diunggah");
  });

  test("rejects mixed PDF and DOCX files in single batch", () => {
    const mixedFiles = [
      { name: "laporan.pdf", type: "application/pdf" },
      {
        name: "lampiran.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ];
    const result = validateUploadFiles(mixedFiles);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toBe(DOCUMENT_COPY.MIXED_TYPES_NOT_ALLOWED);
    expect(result.errorMessage).toBe("Tidak dapat mengunggah file PDF dan DOCX secara bersamaan");
  });

  test("rejects more than 10 DOCX files in single batch", () => {
    const docxList = Array.from({ length: 11 }, (_, i) => ({
      name: `doc-${i + 1}.docx`,
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }));
    const result = validateUploadFiles(docxList);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toBe(DOCUMENT_COPY.EXCEEDS_DOCX_BATCH_LIMIT);
    expect(result.errorMessage).toBe("Maksimal 10 file DOCX yang dapat diunggah sekaligus");
  });

  test("AC-01.03: rejects unsupported files such as .JPG", () => {
    const jpgFile = { name: "foto.jpg", type: "image/jpeg" };
    expect(isSupportedFile(jpgFile)).toBe(false);

    const result = validateUploadFiles([jpgFile]);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toBe(DOCUMENT_COPY.UNSUPPORTED_TYPE);
    expect(result.errorMessage).toBe("Tipe file tidak didukung");
  });

  test("rejects empty file array", () => {
    const result = validateUploadFiles([]);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toBe("Tidak ada file yang dipilih");
  });
});

describe("document-upload API batch request (F2)", () => {
  test("sends multiple DOCX files as a single batch multipart request", async () => {
    let capturedUrl = "";
    let capturedMethod: string | undefined;
    let capturedBody: unknown;

    const mockResponse: DocumentUploadAcceptedData = {
      message: DOCUMENT_COPY.UPLOAD_ACCEPTED,
      count: 3,
      files: [
        { filename: "doc1.docx", size: 1024, documentType: "docx" },
        { filename: "doc2.docx", size: 2048, documentType: "docx" },
        { filename: "doc3.docx", size: 4096, documentType: "docx" },
      ],
    };

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = typeof input === "string" ? input : input.toString();
        capturedMethod = init?.method;
        capturedBody = init?.body;
        return new Response(JSON.stringify({ success: true, data: mockResponse }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    try {
      const files = [
        new File(["dummy 1"], "doc1.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        new File(["dummy 2"], "doc2.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        new File(["dummy 3"], "doc3.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ];

      const result = await uploadDocuments(files);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(capturedUrl).toBe("/api/v1/documents/upload");
      expect(capturedMethod).toBe("POST");
      expect(capturedBody instanceof FormData).toBe(true);

      const formData = capturedBody as FormData;
      const uploadedEntries = formData.getAll("files");
      expect(uploadedEntries.length).toBe(3);

      expect(result.count).toBe(3);
      expect(result.message).toBe("File diterima untuk diproses");
      expect(result.files.length).toBe(3);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("sends single PDF file through uploadDocument", async () => {
    let callCount = 0;
    const mockResponse: DocumentUploadAcceptedData = {
      message: DOCUMENT_COPY.UPLOAD_ACCEPTED,
      count: 1,
      files: [{ filename: "laporan.pdf", size: 2048, documentType: "pdf" }],
    };

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () => {
        callCount++;
        return new Response(JSON.stringify({ success: true, data: mockResponse }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    try {
      const file = new File(["pdf data"], "laporan.pdf", { type: "application/pdf" });
      const result = await uploadDocument(file);

      expect(callCount).toBe(1);
      expect(result.count).toBe(1);
      expect(result.files[0]?.filename).toBe("laporan.pdf");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("document-upload error classification (F2)", () => {
  test("classifies duplicate responses", () => {
    const result = classifyUploadError(
      new ApiClientError(DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT, "File ini sudah ada", 409),
    );

    expect(result.status).toBe("duplicate_error");
    expect(result.message).toBe(DOCUMENT_COPY.DUPLICATE_WARNING);
  });

  test("classifies unsupported type responses", () => {
    const result = classifyUploadError(
      new ApiClientError(
        DOCUMENT_ERROR_CODES.UNSUPPORTED_FILE_TYPE,
        "Tipe file tidak didukung",
        415,
      ),
    );

    expect(result.status).toBe("unsupported_error");
    expect(result.message).toBe(DOCUMENT_COPY.UNSUPPORTED_TYPE);
  });

  test("classifies transport failures as recoverable errors", () => {
    const result = classifyUploadError(new Error("Network request failed"));

    expect(result.status).toBe("error");
    expect(isRecoverableStatus(result.status)).toBe(true);
    expect(result.message).toBe("Network request failed");
  });

  test("falls back to the generic message for unknown throwables", () => {
    const result = classifyUploadError("boom");

    expect(result.status).toBe("error");
    expect(result.message).toBe(UPLOAD_MESSAGES.GENERIC_ERROR);
  });

  test("duplicate and unsupported errors are never recoverable through retry", () => {
    expect(isRecoverableStatus("duplicate_error")).toBe(false);
    expect(isRecoverableStatus("unsupported_error")).toBe(false);
    expect(isRecoverableStatus("processing")).toBe(false);
    expect(isRecoverableStatus("error")).toBe(true);
  });
});
