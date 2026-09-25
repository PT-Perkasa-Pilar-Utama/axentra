// Ensure Happy DOM is available for tests; register if not already.
const { GlobalRegistrator } = require("@happy-dom/global-registrator");
try {
  GlobalRegistrator.register();
} catch {
  // ignore if already registered in this process
}
// Use unknown to avoid `any` lint rule, then narrow to expected shape.
const _win = globalThis as unknown as { window?: { document?: Document } };
globalThis.document = _win.window?.document ?? globalThis.document;

import { describe, test, mock, afterEach } from "bun:test";
import React from "react";
import { useDocumentUploadPresenter } from "../src/features/document-upload/document-upload.presenter";
import { DocumentUploadAreaView } from "../src/features/document-upload/document-upload.view";
import { useRecentDocumentsPresenter } from "../src/features/recent-documents/recent-documents.presenter";
import { RecentDocumentsView } from "../src/features/recent-documents/recent-documents.view";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DocumentUploadAcceptedData } from "@axentra/shared";

// RTL is required here (not imported statically) to keep loading order
// explicit relative to the DOM setup preload.
const rtl = require("@testing-library/react");
const { render, fireEvent, act, cleanup, screen } = rtl;

let _originalFetch: typeof globalThis.fetch | undefined;

afterEach(() => {
  cleanup();
  if (typeof _originalFetch !== "undefined") {
    // restore original fetch to avoid leaking mocks into other tests in this file
    global.fetch = _originalFetch;
    _originalFetch = undefined;
  }
});

function pdf(name = "laporan.pdf") {
  return new File(["content"], name, { type: "application/pdf" });
}

function makeAcceptedResult(name = "laporan.pdf"): DocumentUploadAcceptedData {
  return {
    message: "File diterima untuk diproses",
    count: 1,
    files: [{ filename: name, size: 123, documentType: "pdf" }],
  };
}

function TestIntegration({
  uploadFn,
}: {
  uploadFn?: (files: File[]) => Promise<DocumentUploadAcceptedData>;
}) {
  const client = new QueryClient();
  return (
    <QueryClientProvider client={client}>
      {uploadFn ? <InnerTest uploadFn={uploadFn} /> : <InnerTest />}
    </QueryClientProvider>
  );
}

function InnerTest({
  uploadFn,
}: {
  uploadFn?: (files: File[]) => Promise<DocumentUploadAcceptedData>;
}) {
  const options = uploadFn ? { uploadFn } : undefined;
  const presenter = useDocumentUploadPresenter(options);
  const recent = useRecentDocumentsPresenter(5);
  return (
    <div>
      <DocumentUploadAreaView presenter={presenter} />
      <RecentDocumentsView presenter={recent} />
    </div>
  );
}

describe("Recent documents refresh after upload", () => {
  test("shows uploaded filename after successful upload and refresh", async () => {
    // Mock fetch: first call returns empty list, second call returns uploaded file.
    // Payloads must satisfy recentDocumentSchema (see packages/shared/src/document.ts):
    // id must be a valid UUID, and the date field is `createdAt` in full ISO datetime form.
    let call = 0;
    const fakeFetch = async (): Promise<Response> => {
      call += 1;
      if (call === 1) {
        return new Response(
          JSON.stringify({ success: true, data: [], meta: { page: 1, limit: 5, total: 0 } }),
        );
      }
      return new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              filename: "laporan.pdf",
              processingStatus: "queued",
              createdAt: "2026-09-25T00:00:00.000Z",
            },
          ],
          meta: { page: 1, limit: 5, total: 1 },
        }),
      );
    };
    // store original fetch so we can restore it after the test
    _originalFetch = global.fetch;
    // assign fake fetch for test environment
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error assign compatible runtime function for tests
    global.fetch = fakeFetch;

    const uploadFn = mock(async () => makeAcceptedResult());

    await act(async () => {
      render(<TestIntegration uploadFn={uploadFn} />);
    });

    // Wait for the Documents section to be present
    await screen.findByRole("heading", { name: /Semua Dokumen/i });

    const fileInput = screen.getByTestId("upload-file-input");

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [pdf()] } });
    });

    // Wait for the recent list to update with the uploaded filename
    await screen.findByText(/laporan.pdf/i);
  });
});
