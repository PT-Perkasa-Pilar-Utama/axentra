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

function renderDetail(
  client: QueryClient,
  path = "/documents/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
): string {
  return renderToString(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: "/documents/:id?",
            element: createElement(DocumentDetailView),
          }),
        ),
      ),
    ),
  );
}

describe("Document Detail Feature (FE-S1-03 / AC-03.01)", () => {
  const sampleProcessedDoc: DocumentMetadataResult = {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    documentId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
    author: "Bessie Cooper",
    rawMetadata: {
      extractor: "worker-deterministic",
      method: "pdf_info_dict",
      detected: true,
      filename: "decoy-file-should-not-render.pdf",
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

    // Seed only the metadata-by-ID query; detail must not depend on recent-document pagination.
    queryClient.setQueryData(
      ["document-detail", "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22"],
      sampleProcessedDoc,
    );

    const html = renderDetail(queryClient);

    // Assert AC-03.01 author is rendered correctly in the UI.
    expect(html).toContain('data-testid="metadata-author"');
    expect(html).toContain("Bessie Cooper");
    expect(html).toContain("Nama berkas belum tersedia");
    expect(html).not.toContain("decoy-file-should-not-render.pdf");
    expect(html).toContain("Metadata");
    expect(html).toContain("Tanggal unggah");
    expect(html).toContain("Belum tersedia");
    expect(html).toContain("Pratinjau belum tersedia");
    expect(html).toContain("Dokumen Terkait");
    expect(html).toContain("Unduh");
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-describedby="download-note"');
    expect(html).not.toContain("10/12/2025");
    expect(html).not.toContain("16/12/2025");
    expect(html).not.toContain("Halaman 1");
    expect(html).not.toContain("CustomerAdvise");
  });

  test("AC-03.01: renders 'Tidak terdeteksi' when author metadata is null", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const docWithoutAuthor: DocumentMetadataResult = {
      ...sampleProcessedDoc,
      author: null,
    };

    queryClient.setQueryData(
      ["document-detail", "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22"],
      docWithoutAuthor,
    );

    const html = renderDetail(queryClient);
    expect(html).toContain("Tidak terdeteksi");
    expect(html).not.toContain("Bessie Cooper");
  });

  test("F1 regression: renders author metadata successfully even when document is absent from recent list", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    // Only document-detail metadata query is available; recent query is not executed or empty.
    queryClient.setQueryData(
      ["document-detail", "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22"],
      sampleProcessedDoc,
    );

    const html = renderDetail(queryClient);
    expect(html).toContain('data-testid="metadata-author"');
    expect(html).toContain("Bessie Cooper");
    expect(html).toContain("Nama berkas belum tersedia");
    expect(html).toContain("Belum tersedia");
    expect(html).not.toContain("Gagal memuat metadata");
  });

  test("renders an announced loading state while metadata is pending", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    // A valid query without seeded data remains pending during server render.
    const html = renderDetail(queryClient, "/documents/doc-not-found");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Memuat metadata dokumen...");
    expect(html).not.toContain("Pratinjau belum tersedia");
  });

  test("renders metadata failure and a retry action", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, retryOnMount: false } },
    });
    await queryClient.prefetchQuery({
      queryKey: ["document-detail", sampleProcessedDoc.documentId],
      queryFn: async () => {
        throw new Error("test unavailable");
      },
    });
    const html = renderDetail(queryClient);
    expect(html).toContain("Gagal memuat metadata");
    expect(html).toContain("Coba Lagi");
    expect(html).not.toContain("test unavailable");
    queryClient.clear();
  });

  test("normalizes blank authors and handles long author values securely", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["document-detail", sampleProcessedDoc.documentId], {
      ...sampleProcessedDoc,
      author: "  ",
    });
    const html = renderDetail(queryClient);
    expect(html).toContain("Tidak terdeteksi");
  });
});
