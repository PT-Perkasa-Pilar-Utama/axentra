import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { documentDetailSchema, type DocumentDetail } from "@axentra/shared";
import { getDocumentDetail } from "../src/features/document-detail/document-detail.api";
import { DocumentDetailView } from "../src/features/document-detail/document-detail.view";

const documentId = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

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

function renderDetail(client: QueryClient, path = `/documents/${documentId}`): string {
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

const sampleDetail: DocumentDetail = {
  id: documentId,
  title: "laporan.pdf",
  processingStatus: "completed",
  category: null,
  tags: [],
  file: {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    originalName: "laporan.pdf",
    mimeType: "application/pdf",
    fileSize: 1024,
    fileExtension: "pdf",
    createdAt: "2025-12-16T10:00:00.000Z",
  },
  // Tanggal ekstraksi berbeda dari tanggal unggah; tampilan harus memakai createdAt.
  metadata: { author: "Bessie Cooper", extractedAt: "2025-12-20T10:05:00.000Z" },
  canDownload: true,
  createdAt: "2025-12-16T10:00:00.000Z",
  updatedAt: "2025-12-20T10:05:00.000Z",
};

function seedClient(detail: DocumentDetail): QueryClient {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(["document-detail", documentId], detail);
  return queryClient;
}

describe("Document Detail Feature (FE-S1-03 / AC-03.01)", () => {
  test("AC-03.01: the detail schema parses the response and exposes author metadata", () => {
    const parsed = documentDetailSchema.safeParse(sampleDetail);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.metadata?.author).toBe("Bessie Cooper");
      expect(parsed.data.id).toBe(documentId);
      expect(parsed.data.canDownload).toBe(true);
    }
  });

  test("getDocumentDetail requests GET /documents/:id and not the metadata sub-resource", async () => {
    const originalFetch = globalThis.fetch;
    const requested: string[] = [];
    try {
      globalThis.fetch = createMockFetch(async (url) => {
        requested.push(String(url));
        return new Response(JSON.stringify({ success: true, data: sampleDetail }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });

      const data = await getDocumentDetail(documentId);

      expect(requested).toHaveLength(1);
      expect(requested[0]?.endsWith(`/api/v1/documents/${documentId}`)).toBe(true);
      expect(requested[0]?.includes("/metadata")).toBe(false);
      expect(data.metadata?.author).toBe("Bessie Cooper");
      expect(data.canDownload).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("AC-03.01: renders the author and the upload date from the single detail response", () => {
    const html = renderDetail(seedClient(sampleDetail));

    expect(html).toContain('data-testid="metadata-author"');
    expect(html).toContain("Bessie Cooper");
    expect(html).toContain("Nama berkas belum tersedia");
    expect(html).toContain("Metadata");
    expect(html).toContain("Tanggal unggah");
    // Tanggal unggah dari createdAt (16/12/2025), bukan tanggal ekstraksi metadata (20/12/2025).
    expect(html).toContain("16/12/2025");
    expect(html).not.toContain("20/12/2025");
    expect(html).not.toContain("Memuat tanggal...");
    expect(html).not.toContain("Memuat tag...");
    expect(html).not.toContain("Memuat kategori...");
    expect(html).not.toContain("Belum tersedia");
    // AC-07.01: Dokumen Terkait baru muncul setelah dokumen terbukti memiliki tag.
    expect(html).not.toContain("Dokumen Terkait");
    expect(html).toContain("Memuat pratinjau dokumen...");
    expect(html).toContain("Download");
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-describedby="download-note"');
    expect(html).toContain('id="download-note"');
    expect(html).toContain("Unduh dalam format asli");
    expect(html).not.toContain("Halaman 1");
  });

  test("AC-03.01: renders 'Tidak terdeteksi' when author metadata is null", () => {
    const html = renderDetail(
      seedClient({ ...sampleDetail, metadata: { author: null, extractedAt: null } }),
    );

    expect(html).toContain("Tidak terdeteksi");
    expect(html).not.toContain("Bessie Cooper");
  });

  test("AC-03.01: renders author and upload date when the document is older than any recent list", () => {
    // Tidak ada kueri daftar dokumen terbaru; tanggal tetap tampil dari respons detail.
    const olderDetail: DocumentDetail = {
      ...sampleDetail,
      createdAt: "2019-03-04T08:00:00.000Z",
      updatedAt: "2019-03-04T08:00:00.000Z",
    };
    const html = renderDetail(seedClient(olderDetail));

    expect(html).toContain("Bessie Cooper");
    expect(html).toContain("04/03/2019");
    expect(html).not.toContain("Tidak tersedia");
  });

  test("renders an announced loading state while the detail is pending", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    // A valid query without seeded data remains pending during server render.
    const html = renderDetail(queryClient, "/documents/doc-not-found");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Memuat metadata dokumen...");
    expect(html).not.toContain("Pratinjau belum tersedia");
  });

  test("renders the detail failure and a retry action", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, retryOnMount: false } },
    });
    await queryClient.prefetchQuery({
      queryKey: ["document-detail", documentId],
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

  test("normalizes blank authors", () => {
    const html = renderDetail(seedClient({ ...sampleDetail, metadata: { author: "  " } }));
    expect(html).toContain("Tidak terdeteksi");
  });
});
