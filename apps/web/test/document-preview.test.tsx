import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createElement, StrictMode, type ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import type { DocumentDetail, PreviewDocumentResponse } from "@axentra/shared";
import {
  DocumentDetailView,
  type DocumentDetailViewProps,
} from "../src/features/document-detail/document-detail.view";
import { buildPdfPreviewSrc } from "../src/features/document-detail/document-detail.presenter";
import { usePreviewObjectUrl } from "../src/features/document-detail/document-preview-object-url";
import { RecentDocumentsView } from "../src/features/recent-documents/recent-documents.view";
import type { RecentDocumentsPresenter } from "../src/features/recent-documents/recent-documents.presenter";

const documentId = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const sampleDoc: DocumentDetail = {
  id: documentId,
  title: "laporan.pdf",
  processingStatus: "completed",
  category: null,
  tags: [],
  metadata: { author: "Bessie Cooper", extractedAt: "2025-12-16T10:05:00.000Z" },
  canDownload: true,
  createdAt: "2025-12-16T10:00:00.000Z",
  updatedAt: "2025-12-16T10:05:00.000Z",
};

// Metadata saja: tidak ada previewUrl atau kunci penyimpanan.
const pdfPreview: PreviewDocumentResponse = {
  filename: "laporan.pdf",
  mimeType: "application/pdf",
  fileSize: 1024,
};

function makePdfBlob(): Blob {
  return new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: "application/pdf" });
}

// Mengganti URL.createObjectURL dan revokeObjectURL agar URL dan pencabutannya dapat diamati.
function stubObjectUrls(): {
  created: Array<Blob | MediaSource>;
  revoked: string[];
  restore: () => void;
} {
  const created: Array<Blob | MediaSource> = [];
  const revoked: string[] = [];
  const createSpy = spyOn(URL, "createObjectURL").mockImplementation(
    (object: Blob | MediaSource) => {
      created.push(object);
      return `blob:http://localhost/preview-${created.length}`;
    },
  );
  const revokeSpy = spyOn(URL, "revokeObjectURL").mockImplementation((url: string) => {
    revoked.push(url);
  });
  return {
    created,
    revoked,
    restore: () => {
      createSpy.mockRestore();
      revokeSpy.mockRestore();
    },
  };
}

function renderDetail(options?: {
  preview?: PreviewDocumentResponse;
  previewError?: Error;
  refetchPreview?: () => Promise<PreviewDocumentResponse>;
  contentFetchFn?: () => Promise<Blob>;
}): { queryClient: QueryClient; unmount: () => void } {
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
  const previewContentFetchFn = options?.contentFetchFn ?? (() => Promise.resolve(makePdfBlob()));
  const presenterOptions = previewFetchFn
    ? { previewFetchFn, previewContentFetchFn }
    : { previewContentFetchFn };
  const { unmount } = render(
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
              presenterOptions,
            }),
          }),
        ),
      ),
    ),
  );
  return { queryClient, unmount };
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
      pagination: {
        page: 1,
        totalPages: 1,
        hasPrevious: false,
        hasNext: false,
        isChanging: false,
        goToPage: () => {},
      },
    };
    render(createElement(MemoryRouter, null, createElement(RecentDocumentsView, { presenter })));

    const openDocument = screen.getByRole("link", { name: "Buka laporan.pdf" });
    expect(openDocument.getAttribute("href")).toBe(`/documents/${documentId}`);
    expect(openDocument.getAttribute("download")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Pilih laporan.pdf" })).toBeTruthy();
  });

  test("renders PDF inline from a blob URL built from the streamed API bytes", async () => {
    const stub = stubObjectUrls();
    try {
      const pdfBlob = makePdfBlob();
      renderDetail({ preview: pdfPreview, contentFetchFn: () => Promise.resolve(pdfBlob) });

      const frame = await screen.findByTitle("Pratinjau laporan.pdf");
      expect(frame.tagName).toBe("IFRAME");
      expect(stub.created[0]).toBe(pdfBlob);
      expect(frame.getAttribute("src")).toBe(buildPdfPreviewSrc("blob:http://localhost/preview-1"));
      expect(frame.getAttribute("src")).toContain("toolbar=0");
      expect(frame.hasAttribute("download")).toBe(false);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("laporan.pdf");
      expect(
        screen.getByRole("main", { name: "Area Pratinjau Dokumen" }).querySelector("a"),
      ).toBeNull();
      expect(screen.getByRole("button", { name: "Download" }).hasAttribute("disabled")).toBe(false);
    } finally {
      stub.restore();
    }
  });

  test("does not place a storage key, server content URL, or previewUrl in the DOM", async () => {
    const stub = stubObjectUrls();
    try {
      renderDetail({ preview: pdfPreview });

      const frame = await screen.findByTitle("Pratinjau laporan.pdf");
      expect(frame.getAttribute("src")?.startsWith("blob:")).toBe(true);
      const html = document.body.innerHTML;
      expect(html).not.toContain("/preview/content");
      expect(html).not.toContain("previewUrl");
      expect(html).not.toContain("storage/");
      expect(html).not.toContain("X-Amz");
      expect(html).not.toContain("expires=");
    } finally {
      stub.restore();
    }
  });

  test("revokes the blob URL when the preview view unmounts", async () => {
    const stub = stubObjectUrls();
    try {
      const { unmount } = renderDetail({ preview: pdfPreview });

      await screen.findByTitle("Pratinjau laporan.pdf");
      expect(stub.revoked).toEqual([]);

      unmount();
      expect(stub.revoked).toEqual(["blob:http://localhost/preview-1"]);
    } finally {
      stub.restore();
    }
  });

  test("revokes the previous blob URL when the blob changes and never returns a revoked URL", () => {
    const stub = stubObjectUrls();
    try {
      const first = makePdfBlob();
      const second = makePdfBlob();
      const initialProps: { blob: Blob | undefined } = { blob: first };
      const { result, rerender, unmount } = renderHook(
        ({ blob }: { blob: Blob | undefined }) => usePreviewObjectUrl(blob),
        { initialProps },
      );
      expect(result.current).toBe("blob:http://localhost/preview-1");

      rerender({ blob: second });
      expect(stub.revoked).toEqual(["blob:http://localhost/preview-1"]);
      expect(result.current).toBe("blob:http://localhost/preview-2");

      rerender({ blob: undefined });
      expect(stub.revoked).toEqual([
        "blob:http://localhost/preview-1",
        "blob:http://localhost/preview-2",
      ]);
      expect(result.current).toBeNull();

      unmount();
      expect(stub.revoked).toHaveLength(2);
    } finally {
      stub.restore();
    }
  });

  test("keeps the live blob URL when StrictMode replays the subscription", () => {
    const stub = stubObjectUrls();
    try {
      const blob = makePdfBlob();
      const { result, unmount } = renderHook(() => usePreviewObjectUrl(blob), {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(StrictMode, null, children),
      });

      const live = result.current;
      expect(live).not.toBeNull();
      expect(stub.revoked).not.toContain(live ?? "");

      unmount();
      expect(stub.revoked).toHaveLength(stub.created.length);
    } finally {
      stub.restore();
    }
  });

  test("shows preview error and lets the user retry successfully", async () => {
    let attempts = 0;
    const { queryClient } = renderDetail({
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

  test("shows content error without leaking the message and retries the byte stream", async () => {
    const stub = stubObjectUrls();
    try {
      let attempts = 0;
      renderDetail({
        preview: pdfPreview,
        contentFetchFn: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error("content unavailable at storage/laporan.pdf");
          }
          return makePdfBlob();
        },
      });

      expect(await screen.findByRole("heading", { name: "Pratinjau gagal dimuat" })).toBeTruthy();
      expect(screen.queryByText(/content unavailable/)).toBeNull();
      expect(document.body.innerHTML).not.toContain("storage/laporan.pdf");

      const canvas = screen.getByRole("main", { name: "Area Pratinjau Dokumen" });
      const retryBtn = within(canvas).getByRole("button", { name: "Coba lagi" });
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(await screen.findByTitle("Pratinjau laporan.pdf")).toBeTruthy();
      expect(attempts).toBe(2);
      expect(stub.created).toHaveLength(1);
    } finally {
      stub.restore();
    }
  });

  test("shows an explicit DOCX fallback without requesting or exposing the bytes", async () => {
    let contentRequests = 0;
    const docxPreview: PreviewDocumentResponse = {
      ...pdfPreview,
      filename: "kontrak.docx",
      mimeType: DOCX_MIME_TYPE,
    };
    renderDetail({
      preview: docxPreview,
      contentFetchFn: () => {
        contentRequests += 1;
        return Promise.resolve(makePdfBlob());
      },
    });

    expect(
      await screen.findByRole("heading", { name: "Pratinjau belum tersedia untuk format ini" }),
    ).toBeTruthy();
    const canvas = screen.getByRole("main", { name: "Area Pratinjau Dokumen" });
    expect(canvas.textContent).toContain("kontrak.docx");
    expect(canvas.textContent).toContain("format DOCX belum didukung");
    expect(canvas.textContent).not.toContain("application/vnd.openxmlformats");

    expect(canvas.querySelector("iframe")).toBeNull();
    expect(canvas.querySelector("a")).toBeNull();
    expect(contentRequests).toBe(0);
  });

  test("does not render invented page controls or a preview-triggered download", async () => {
    renderDetail({ preview: pdfPreview });

    expect(await screen.findByTitle("Pratinjau laporan.pdf")).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Halaman dokumen" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Halaman 1" })).toBeNull();
    const downloadButton = screen.getByRole("button", { name: "Download" });
    expect(downloadButton.hasAttribute("disabled")).toBe(false);
    const noteId = downloadButton.getAttribute("aria-describedby");
    expect(noteId).toBe("download-note");
    const note = noteId ? document.getElementById(noteId) : null;
    expect(note?.textContent).toContain("Unduh dalam format asli");
    expect(screen.getByRole("complementary", { name: "Informasi Dokumen" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /download|unduh/i })).toBeNull();
  });
});

describe("buildPdfPreviewSrc (F1)", () => {
  test("hides the native PDF toolbar and keeps the query intact", () => {
    const signed = "https://storage.example/axentra/doc.pdf?X-Amz-Signature=abc&X-Amz-Expires=300";
    const result = new URL(buildPdfPreviewSrc(signed));
    expect(result.hash).toBe("#toolbar=0&navpanes=0");
    expect(result.searchParams.get("X-Amz-Signature")).toBe("abc");
    expect(result.searchParams.get("X-Amz-Expires")).toBe("300");
  });

  test("replaces an existing fragment instead of appending to it", () => {
    expect(buildPdfPreviewSrc("https://storage.example/doc.pdf#page=2")).toBe(
      "https://storage.example/doc.pdf#toolbar=0&navpanes=0",
    );
  });
});
