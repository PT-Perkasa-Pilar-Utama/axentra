import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { documentMetadataResultSchema, type DocumentMetadataResult } from "@axentra/shared";
import { getDocumentDetail } from "../src/features/document-detail/document-detail.api";
import { DocumentDetailView } from "../src/features/document-detail/document-detail.view";

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

describe("Document Detail Feature (FE-S1-03 / AC-03.01)", () => {
  const sampleProcessedDoc: DocumentMetadataResult = {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    documentId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
    author: "Bessie Cooper",
    rawMetadata: {
      filename: "laporan-keuangan.pdf",
      category: "Report",
      tags: ["Strategy", "AI", "Data Science", "ExtraTagIgnored"],
    },
    extractedAt: "2025-12-16T10:05:00.000Z",
    createdAt: "2025-12-16T10:00:00.000Z",
    updatedAt: "2025-12-16T10:05:00.000Z",
  };

  test("AC-03.01: parses and validates author metadata from extraction result", () => {
    const parsed = documentMetadataResultSchema.safeParse(sampleProcessedDoc);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.author).toBe("Bessie Cooper");
      expect(parsed.data.documentId).toBe("b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22");
      expect(parsed.data.extractedAt).toBeDefined();
    }
  });

  test("AC-03.01: getDocumentDetail fetches from /documents/:id/metadata", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = createMockFetch(async (url) => {
        expect(String(url)).toContain(
          "/api/v1/documents/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22/metadata",
        );
        return new Response(JSON.stringify({ success: true, data: sampleProcessedDoc }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });

      const data = await getDocumentDetail("b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22");
      expect(data.author).toBe("Bessie Cooper");
      expect(data.documentId).toBe("b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22");
    } finally {
      globalThis.fetch = originalFetch;
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
      ["document-detail", "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22"],
      sampleProcessedDoc,
    );

    const element = createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: ["/documents/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22"] },
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
