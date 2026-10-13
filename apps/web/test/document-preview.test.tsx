import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import type { DocumentMetadataResult } from "@axentra/shared";
import { DocumentDetailView } from "../src/features/document-detail/document-detail.view";
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

function renderDetail(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(["document-detail", documentId], sampleDoc);
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
            element: createElement(DocumentDetailView),
          }),
        ),
      ),
    ),
  );
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
        },
      ],
      refresh: async () => {},
      retry: async () => {},
    };
    render(createElement(MemoryRouter, null, createElement(RecentDocumentsView, { presenter })));

    const openDocument = screen.getByRole("link", { name: "Buka laporan.pdf" });
    expect(openDocument.getAttribute("href")).toBe(`/documents/${documentId}`);
    expect(openDocument.getAttribute("download")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Pilih laporan.pdf" })).toBeTruthy();
  });

  test("shows a bounded three-panel preview shell without inventing document pages", () => {
    renderDetail();

    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Halaman dokumen" })).toBeTruthy();
    expect(screen.getByRole("main", { name: "Area Pratinjau Dokumen" })).toBeTruthy();
    expect(screen.getByText("Pratinjau belum tersedia")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Halaman 1" })).toBeNull();
    expect(screen.getByRole("button", { name: /unduh/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("complementary", { name: "Informasi Dokumen" })).toBeTruthy();
  });
});
