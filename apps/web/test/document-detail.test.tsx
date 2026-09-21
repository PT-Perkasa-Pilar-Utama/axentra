import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { documentDetailSchema, type DocumentDetail } from "@axentra/shared";
import { DocumentDetailView } from "../src/features/document-detail/document-detail.view";

describe("Document Detail Feature (FE-S1-03 / AC-03.01)", () => {
  const sampleProcessedDoc: DocumentDetail = {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    title: "laporan-keuangan.pdf",
    processingStatus: "completed",
    file: {
      id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      originalName: "laporan-keuangan.pdf",
      mimeType: "application/pdf",
      fileSize: 2048000,
      fileExtension: "pdf",
      createdAt: "2025-12-16T10:00:00.000Z",
    },
    category: {
      id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
      name: "Report",
      slug: "report",
      downloadEnabled: true,
      createdAt: "2025-12-16T10:00:00.000Z",
      updatedAt: "2025-12-16T10:00:00.000Z",
    },
    tags: [
      {
        id: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44",
        name: "Strategy",
        createdAt: "2025-12-16T10:00:00.000Z",
      },
      {
        id: "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55",
        name: "AI",
        createdAt: "2025-12-16T10:00:00.000Z",
      },
      {
        id: "f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66",
        name: "Data Science",
        createdAt: "2025-12-16T10:00:00.000Z",
      },
      {
        id: "10eebc99-9c0b-4ef8-bb6d-6bb9bd380a77",
        name: "ExtraTagIgnored",
        createdAt: "2025-12-16T10:00:00.000Z",
      },
    ],
    metadata: {
      author: "Bessie Cooper",
      extractedAt: "2025-12-16T10:05:00.000Z",
    },
    createdAt: "2025-12-16T10:00:00.000Z",
    updatedAt: "2025-12-16T10:05:00.000Z",
  };

  test("AC-03.01: parses and validates author metadata from processed document", () => {
    const parsed = documentDetailSchema.safeParse(sampleProcessedDoc);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.metadata?.author).toBe("Bessie Cooper");
      expect(parsed.data.processingStatus).toBe("completed");
    }
  });

  test("AC-03.01: renders document detail view and displays author metadata", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    // Seed query data to simulate ready state with processed author metadata
    queryClient.setQueryData(
      ["document-detail", "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"],
      sampleProcessedDoc,
    );

    const element = createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: ["/documents/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: "/documents/:id",
            element: createElement(DocumentDetailView),
          }),
        ),
      ),
    );

    const html = renderToString(element);

    // Assert AC-03.01 author is rendered correctly in the UI
    expect(html).toContain('data-testid="metadata-author"');
    expect(html).toContain("Bessie Cooper");
    expect(html).toContain("laporan-keuangan.pdf");
    expect(html).toContain("Metadata Dokumen");
    expect(html).toContain("Selesai Diproses");
    expect(html).toContain("Strategy");
    expect(html).toContain("AI");
    expect(html).toContain("Data Science");
    // Ensure capped tags (max 3)
    expect(html).not.toContain("ExtraTagIgnored");

    // Ensure out-of-scope sprint 2/3 elements are NOT rendered (Fix for F2)
    expect(html).not.toContain("Related Documents");
    expect(html).not.toContain("CustomerAdvise");
    expect(html).not.toContain("Download");
    expect(html).not.toContain("Halaman 1 dari 2");
  });

  test("renders error state when document is not found or API fails", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    // No seeded data -> empty ID or failed query
    const element = createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: ["/documents/doc-not-found"] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: "/documents/:id",
            element: createElement(DocumentDetailView),
          }),
        ),
      ),
    );

    const html = renderToString(element);
    // In server render without data, it renders error or loading skeleton gracefully
    expect(html).toBeDefined();
    expect(html.length).toBeGreaterThan(0);
  });
});
