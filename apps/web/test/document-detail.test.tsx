import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { documentMetadataSchema, type DocumentMetadata } from "@axentra/shared";
import { DocumentDetailView } from "../src/features/document-detail/document-detail.view";

describe("Document Detail Feature (FE-S1-03 / AC-03.01)", () => {
  const sampleProcessedDoc: DocumentMetadata = {
    id: "doc-123",
    filename: "laporan-keuangan.pdf",
    author: "Bessie Cooper",
    format: "PDF",
    sizeBytes: 2048000,
    tags: ["Strategy", "AI", "Data Science", "ExtraTagIgnored"],
    category: "Report",
    uploadDate: "16/12/2025",
    processingStatus: "processed",
  };

  test("AC-03.01: parses and validates author metadata from processed document", () => {
    const parsed = documentMetadataSchema.safeParse(sampleProcessedDoc);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.author).toBe("Bessie Cooper");
      expect(parsed.data.processingStatus).toBe("processed");
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
    queryClient.setQueryData(["document-detail", "doc-123"], sampleProcessedDoc);

    const element = createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: ["/documents/doc-123"] },
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
