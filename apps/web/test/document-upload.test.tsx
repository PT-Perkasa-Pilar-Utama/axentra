import { describe, expect, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
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
  isSupportedFile,
  validateUploadFiles,
  UPLOAD_MESSAGES,
} from "../src/features/document-upload/document-upload.presenter";
import {
  DocumentUploadAreaView,
  DocumentUploadNotificationView,
  DocumentUploadPage,
} from "../src/features/document-upload/document-upload.view";
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

describe("document-upload presenter state handling", () => {
  test("handles successful upload and triggers onSuccess callback", async () => {
    const acceptedData: DocumentUploadAcceptedData = {
      message: DOCUMENT_COPY.UPLOAD_ACCEPTED,
      count: 1,
      files: [{ filename: "doc.pdf", size: 100, documentType: "pdf" }],
    };

    let callbackCalledWith: DocumentUploadAcceptedData | null = null;
    const mockUpload = async (): Promise<DocumentUploadAcceptedData> => acceptedData;

    const files = [new File(["test"], "doc.pdf", { type: "application/pdf" })];
    const validation = validateUploadFiles(files);
    expect(validation.valid).toBe(true);

    const result = await mockUpload();
    callbackCalledWith = result;

    expect(callbackCalledWith.message).toBe("File diterima untuk diproses");
    expect(callbackCalledWith.count).toBe(1);
  });

  test("handles duplicate error with DUPLICATE_DOCUMENT code", () => {
    const error = new ApiClientError(
      DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT,
      "File ini sudah ada",
      409,
    );

    expect(error.code).toBe("DUPLICATE_DOCUMENT");
    expect(error.status).toBe(409);
    expect(UPLOAD_MESSAGES.DUPLICATE).toBe("File ini sudah ada");
  });

  test("handles unsupported file type rejection", () => {
    const badFiles = [new File(["img"], "image.jpg", { type: "image/jpeg" })];
    const validation = validateUploadFiles(badFiles);
    expect(validation.valid).toBe(false);
    expect(validation.errorMessage).toBe(UPLOAD_MESSAGES.UNSUPPORTED);
  });
});

describe("document-upload view & route integration (F4)", () => {
  test("renders empty prompt and dropzone in idle state", () => {
    const presenterMock = {
      status: "idle" as const,
      isUploading: false,
      notification: null,
      uploadedResult: null,
      uploadFiles: async () => {},
      dismissNotification: () => {},
      reset: () => {},
    };

    const html = renderToString(<DocumentUploadAreaView presenter={presenterMock} />);

    expect(html).toContain("Area Unggah Dokumen");
    expect(html).toContain("Pilih atau seret file PDF atau DOCX ke sini");
    expect(html).toContain("Pilih File");
    expect(html).toContain('type="file"');
    expect(html).toContain('accept=".pdf,.docx');
  });

  test("renders loading state when isUploading is true", () => {
    const presenterMock = {
      status: "uploading" as const,
      isUploading: true,
      notification: null,
      uploadedResult: null,
      uploadFiles: async () => {},
      dismissNotification: () => {},
      reset: () => {},
    };

    const html = renderToString(<DocumentUploadAreaView presenter={presenterMock} />);

    expect(html).toContain("Mengunggah dokumen...");
    expect(html).toContain('data-testid="upload-loading-state"');
  });

  test("renders success notification view", () => {
    const presenterMock = {
      status: "success" as const,
      isUploading: false,
      notification: {
        type: "success" as const,
        message: DOCUMENT_COPY.UPLOAD_ACCEPTED,
      },
      uploadedResult: {
        message: DOCUMENT_COPY.UPLOAD_ACCEPTED,
        count: 1,
        files: [{ filename: "laporan.pdf", size: 1024, documentType: "pdf" as const }],
      },
      uploadFiles: async () => {},
      dismissNotification: () => {},
      reset: () => {},
    };

    const html = renderToString(<DocumentUploadNotificationView presenter={presenterMock} />);

    expect(html).toContain("File diterima untuk diproses");
    expect(html).toContain("bg-emerald-50");
    expect(html).toContain("✓");
  });

  test("renders duplicate error notification view", () => {
    const presenterMock = {
      status: "duplicate_error" as const,
      isUploading: false,
      notification: {
        type: "error" as const,
        message: DOCUMENT_COPY.DUPLICATE_WARNING,
      },
      uploadedResult: null,
      uploadFiles: async () => {},
      dismissNotification: () => {},
      reset: () => {},
    };

    const html = renderToString(<DocumentUploadNotificationView presenter={presenterMock} />);

    expect(html).toContain("File ini sudah ada");
    expect(html).toContain("bg-rose-50");
    expect(html).toContain("✕");
  });

  test("renders unsupported error notification view", () => {
    const presenterMock = {
      status: "unsupported_error" as const,
      isUploading: false,
      notification: {
        type: "error" as const,
        message: DOCUMENT_COPY.UNSUPPORTED_TYPE,
      },
      uploadedResult: null,
      uploadFiles: async () => {},
      dismissNotification: () => {},
      reset: () => {},
    };

    const html = renderToString(<DocumentUploadNotificationView presenter={presenterMock} />);

    expect(html).toContain("Tipe file tidak didukung");
    expect(html).toContain("bg-rose-50");
  });

  test("renders generic error notification view", () => {
    const presenterMock = {
      status: "error" as const,
      isUploading: false,
      notification: {
        type: "error" as const,
        message: "Gagal mengunggah file",
      },
      uploadedResult: null,
      uploadFiles: async () => {},
      dismissNotification: () => {},
      reset: () => {},
    };

    const html = renderToString(<DocumentUploadNotificationView presenter={presenterMock} />);

    expect(html).toContain("Gagal mengunggah file");
    expect(html).toContain("bg-rose-50");
  });

  test("returns empty output when notification is null", () => {
    const presenterMock = {
      status: "idle" as const,
      isUploading: false,
      notification: null,
      uploadedResult: null,
      uploadFiles: async () => {},
      dismissNotification: () => {},
      reset: () => {},
    };

    const html = renderToString(<DocumentUploadNotificationView presenter={presenterMock} />);

    expect(html).toBe("");
  });

  test("AC-01.01 to AC-01.04: renders DocumentUploadPage connected to presenter and route /upload", () => {
    const element = createElement(
      MemoryRouter,
      { initialEntries: ["/upload"] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/upload",
          element: createElement(DocumentUploadPage),
        }),
      ),
    );

    const html = renderToString(element);

    expect(html).toContain("Unggah Dokumen");
    expect(html).toContain("Area Unggah Dokumen");
    expect(html).toContain("Pilih atau seret file PDF atau DOCX ke sini");
    expect(html).toContain("Pilih File");
    expect(html).toContain('type="file"');
    expect(html).toContain('accept=".pdf,.docx');
  });
});
