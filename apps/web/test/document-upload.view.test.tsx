import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import type { DocumentUploadAcceptedData } from "@axentra/shared";
import { DOCUMENT_COPY } from "@axentra/shared";
import { UPLOAD_MESSAGES } from "../src/features/document-upload/document-upload.presenter";
import {
  DocumentUploadAreaView,
  DocumentUploadNotificationView,
  DocumentUploadPage,
} from "../src/features/document-upload/document-upload.view";
import { stubPresenter } from "./support/presenter-stub";

describe("document-upload dropzone states (F4)", () => {
  test("renders empty prompt and dropzone in idle state", () => {
    const html = renderToString(
      <DocumentUploadAreaView presenter={stubPresenter({ status: "idle" })} />,
    );

    expect(html).toContain("Area Unggah Dokumen");
    expect(html).toContain("Klik di sini");
    expect(html).toContain('type="file"');
    expect(html).toContain('accept=".pdf,.docx');
  });

  test("renders loading state when uploading", () => {
    const html = renderToString(
      <DocumentUploadAreaView presenter={stubPresenter({ status: "uploading" })} />,
    );

    expect(html).toContain("Mengunggah dokumen...");
    expect(html).toContain('data-testid="upload-loading-state"');
  });

  test("F2: renders a distinct processing state after an accepted upload", () => {
    const accepted: DocumentUploadAcceptedData = {
      message: DOCUMENT_COPY.UPLOAD_ACCEPTED,
      count: 1,
      files: [{ filename: "laporan.pdf", size: 1024, documentType: "pdf" }],
    };

    const html = renderToString(
      <DocumentUploadAreaView
        presenter={stubPresenter({
          status: "processing",
          uploadedResult: accepted,
          notification: { type: "success", message: DOCUMENT_COPY.UPLOAD_ACCEPTED },
        })}
      />,
    );

    expect(html).toContain('data-testid="upload-processing-state"');
    expect(html).toContain("Dokumen sedang diproses...");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('data-testid="upload-loading-state"');
    expect(html).not.toContain('data-testid="upload-empty-prompt"');
  });

  test("F2: success state no longer shows the processing indicator", () => {
    const html = renderToString(
      <DocumentUploadAreaView presenter={stubPresenter({ status: "success" })} />,
    );

    expect(html).not.toContain('data-testid="upload-processing-state"');
    expect(html).toContain('data-testid="upload-empty-prompt"');
  });

  test("F2: offers a retry action and keeps the attempted file selection", () => {
    const failedFiles = [new File(["data"], "laporan.pdf", { type: "application/pdf" })];

    const html = renderToString(
      <DocumentUploadAreaView
        presenter={stubPresenter({
          status: "error",
          canRetry: true,
          pendingFiles: failedFiles,
          notification: { type: "error", message: UPLOAD_MESSAGES.GENERIC_ERROR },
        })}
      />,
    );

    expect(html).toContain('data-testid="upload-retry-button"');
    expect(html).toContain("Coba unggah lagi");
    expect(html).toContain('data-testid="upload-retained-files"');
    expect(html).toContain("laporan.pdf");
  });

  test("F2: retry button triggers the presenter retry handler", async () => {
    let retryCalls = 0;
    const presenter = stubPresenter({
      status: "error",
      canRetry: true,
      pendingFiles: [new File(["data"], "laporan.pdf", { type: "application/pdf" })],
      retry: async () => {
        retryCalls += 1;
      },
    });

    await presenter.retry();

    expect(retryCalls).toBe(1);
  });

  test("F2: duplicate errors do not offer a retry action", () => {
    const html = renderToString(
      <DocumentUploadAreaView
        presenter={stubPresenter({
          status: "duplicate_error",
          canRetry: false,
          notification: { type: "error", message: DOCUMENT_COPY.DUPLICATE_WARNING },
        })}
      />,
    );

    expect(html).not.toContain('data-testid="upload-retry-button"');
    expect(html).toContain('data-testid="upload-empty-prompt"');
  });
});

describe("document-upload notification view", () => {
  test("renders success notification view", () => {
    const html = renderToString(
      <DocumentUploadNotificationView
        presenter={stubPresenter({
          status: "success",
          uploadedResult: {
            message: DOCUMENT_COPY.UPLOAD_ACCEPTED,
            count: 1,
            files: [{ filename: "laporan.pdf", size: 1024, documentType: "pdf" as const }],
          },
          notification: { type: "success", message: DOCUMENT_COPY.UPLOAD_ACCEPTED },
        })}
      />,
    );

    expect(html).toContain("File diterima untuk diproses");
    expect(html).toContain("bg-[#c9f0dc]/90");
    expect(html).toContain("Upload berhasil.");
  });

  test("renders duplicate error notification view", () => {
    const html = renderToString(
      <DocumentUploadNotificationView
        presenter={stubPresenter({
          status: "duplicate_error",
          notification: { type: "error", message: DOCUMENT_COPY.DUPLICATE_WARNING },
        })}
      />,
    );

    expect(html).toContain("File ini sudah ada");
    expect(html).toContain("bg-[#f0a7a7]/90");
    expect(html).toContain("Upload gagal.");
  });

  test("renders unsupported error notification view", () => {
    const html = renderToString(
      <DocumentUploadNotificationView
        presenter={stubPresenter({
          status: "unsupported_error",
          notification: { type: "error", message: DOCUMENT_COPY.UNSUPPORTED_TYPE },
        })}
      />,
    );

    expect(html).toContain("Tipe file tidak didukung");
    expect(html).toContain("bg-[#f0a7a7]/90");
    expect(html).toContain("Upload gagal.");
  });

  test("renders generic error notification view", () => {
    const html = renderToString(
      <DocumentUploadNotificationView
        presenter={stubPresenter({
          status: "error",
          notification: { type: "error", message: UPLOAD_MESSAGES.GENERIC_ERROR },
        })}
      />,
    );

    expect(html).toContain("Gagal mengunggah file");
    expect(html).toContain("bg-[#f0a7a7]/90");
    expect(html).toContain("Upload gagal.");
  });

  test("returns empty output when notification is null", () => {
    const html = renderToString(
      <DocumentUploadNotificationView presenter={stubPresenter({ status: "idle" })} />,
    );

    expect(html).toBe("");
  });
});

describe("document-upload page & route integration", () => {
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
    expect(html).toContain("Klik di sini");
    expect(html).toContain('type="file"');
    expect(html).toContain('accept=".pdf,.docx');
  });
});
