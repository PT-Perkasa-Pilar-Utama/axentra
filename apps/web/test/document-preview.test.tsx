import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import type { DocumentMetadataResult, PreviewDocumentResponse } from "@axentra/shared";
import {
  DocumentDetailView,
  type DocumentDetailViewProps,
} from "../src/features/document-detail/document-detail.view";
import { RecentDocumentsView } from "../src/features/recent-documents/recent-documents.view";
import type { RecentDocumentsPresenter } from "../src/features/recent-documents/recent-documents.presenter";

const documentId = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const sampleDoc: DocumentMetadataResult = {
  id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  documentId,
  author: "Bessie Cooper",
  rawMetadata: null,
  extractedAt: "2025-12-16T10:05:00.000Z",
  createdAt: "2025-12-16T10:00:00.000Z",
  updatedAt: "2025-12-16T10:05:00.000Z",
};

const pdfPreview: PreviewDocumentResponse = {
  previewUrl: "about:blank#preview-fixture",
  filename: "laporan.pdf",
  mimeType: "application/pdf",
  fileSize: 1024,
  expiresInSeconds: 300,
};

function renderDetail(options?: {
  preview?: PreviewDocumentResponse;
  previewError?: Error;
  refetchPreview?: () => Promise<PreviewDocumentResponse>;
}): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });
  queryClient.setQueryData(["document-detail", documentId], sampleDoc);
  if (options?.preview) {
    queryClient.setQueryData(["document-preview", documentId], options.preview);
  }
  const preview = options?.preview;
  const previewError = options?.previewError;
  let previewFetchFn = options?.refetchPreview;
  if (!previewFetchFn && preview) {
    previewFetchFn = () => Promise.resolve(preview);
  } else if (!previewFetchFn && previewError) {
    previewFetchFn = () => Promise.reject(previewError);
  }
  render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: [`/documents/${documentId}`] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: "/documents/:id",
            element: createElement<DocumentDetailViewProps>(DocumentDetailView, {
              presenterOptions: previewFetchFn ? { previewFetchFn } : undefined,
            }),
          }),
        ),
      ),
    ),
  );
  return queryClient;
}

describe("Document preview entry (FE-S3-01 / AC-08.01)", () => {
  afterEach(cleanup);

  test("opens the selected document from its dashboard row without starting a download", () => {
    const presenter: RecentDocumentsPresenter = {
      isLoading: false,
      isError: false,
      isEmpty: false,
      items: [
        {
          id: documentId,
          filename: "laporan.pdf",
          dateLabel: "16/12/2025",
          statusLabel: "Selesai Diproses",
          processingStatus: "completed",
          smartTags: {
            isLoading: false,
            isError: false,
            isEmpty: true,
            tags: [],
            retry: () => {},
          },
          isSelected: false,
          category: {
            isLoading: false,
            isError: false,
            name: "Finance",
            retry: () => {},
          },
        },
      ],
      refresh: async () => {},
      retry: async () => {},
      selectedIds: new Set(),
      isDownloading: false,
      downloadError: null,
      toggleSelect: () => {},
      clearSelection: () => {},
      downloadSelected: async () => {},
    };
    render(createElement(MemoryRouter, null, createElement(RecentDocumentsView, { presenter })));

    const openDocument = screen.getByRole("link", { name: "Buka laporan.pdf" });
    expect(openDocument.getAttribute("href")).toBe(`/documents/${documentId}`);
    expect(openDocument.getAttribute("download")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Pilih laporan.pdf" })).toBeTruthy();
  });

  test("renders PDF inline from the API preview URL without a download link", async () => {
    renderDetail({ preview: pdfPreview });

    const frame = await screen.findByTitle("Pratinjau laporan.pdf");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame.getAttribute("src")).toBe(pdfPreview.previewUrl);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("laporan.pdf");
    expect(
      screen.getByRole("main", { name: "Area Pratinjau Dokumen" }).querySelector("a"),
    ).toBeNull();
    expect(screen.getByRole("button", { name: /unduh/i }).hasAttribute("disabled")).toBe(false);
  });

  test("shows an explicit DOCX fallback without exposing a download URL", async () => {
    const docxPreview: PreviewDocumentResponse = {
      ...pdfPreview,
      filename: "kontrak.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    renderDetail({ preview: docxPreview });

    expect(
      await screen.findByRole("heading", { name: "Pratinjau belum tersedia untuk format ini" }),
    ).toBeTruthy();
    const canvas = screen.getByRole("main", { name: "Area Pratinjau Dokumen" });
    expect(canvas.textContent).toContain("kontrak.docx");
    expect(canvas.textContent).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    expect(canvas.querySelector("iframe")).toBeNull();
    expect(canvas.querySelector("a")).toBeNull();
    expect(canvas.textContent).not.toContain(docxPreview.previewUrl);
  });

  test("shows preview error and lets the user retry successfully", async () => {
    let attempts = 0;
    const queryClient = renderDetail({
      previewError: new Error("preview unavailable"),
      refetchPreview: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("preview unavailable");
        }
        return pdfPreview;
      },
    });

    const errorHeading = await screen.findByRole("heading", { name: "Pratinjau gagal dimuat" });
    expect(errorHeading).toBeTruthy();
    expect(screen.queryByText("preview unavailable")).toBeNull();

    const canvas = screen.getByRole("main", { name: "Area Pratinjau Dokumen" });
    const retryBtn = within(canvas).getByRole("button", { name: "Coba lagi" });
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    expect(await screen.findByTitle("Pratinjau laporan.pdf")).toBeTruthy();
    expect(attempts).toBe(2);
    queryClient.clear();
  });

  test("does not render invented page controls or a preview-triggered download", async () => {
    renderDetail({ preview: pdfPreview });

    expect(await screen.findByTitle("Pratinjau laporan.pdf")).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Halaman dokumen" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Halaman 1" })).toBeNull();
    const downloadButton = screen.getByRole("button", { name: /unduh/i });
    expect(downloadButton.hasAttribute("disabled")).toBe(false);
    const noteId = downloadButton.getAttribute("aria-describedby");
    expect(noteId).toBe("download-note");
    const note = noteId ? document.getElementById(noteId) : null;
    expect(note?.textContent).toContain("Unduh dalam format asli");
    expect(screen.getByRole("complementary", { name: "Informasi Dokumen" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /download|unduh/i })).toBeNull();
  });
});
