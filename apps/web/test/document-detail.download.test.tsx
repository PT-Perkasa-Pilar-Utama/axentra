// Ensure Happy DOM is available for tests
const { GlobalRegistrator } = require("@happy-dom/global-registrator");
try {
  GlobalRegistrator.register();
} catch {
  /* already registered */
}

if (typeof window !== "undefined" && window.document) {
  globalThis.document = window.document;
}

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import {
  derivePreviewView,
  formatMimeLabel,
  isSafeDownloadUrl,
} from "../src/features/document-detail/document-detail.presenter";
import { DocumentDetailView } from "../src/features/document-detail/document-detail.view";
import { AuthSessionProvider } from "../src/features/auth/auth-session.context";
import type { AuthSession } from "../src/features/auth/session.storage";

const memberSession: AuthSession = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "member@axentra.test",
    name: "Member Team",
    role: "member_team",
  },
  token: "ax_member_session_token",
  rememberMe: false,
};

const DOWNLOAD_URL = "http://localhost/files/laporan-rahasia.pdf";

type ClickedAnchor = { href: string; download: string | null };

function spyOnAnchorClick(): { clicks: ClickedAnchor[]; restore: () => void } {
  const clicks: ClickedAnchor[] = [];
  // Ambil prototype dari elemen nyata: tidak bergantung pada window.HTMLAnchorElement
  // yang tidak tersedia di semua konfigurasi Happy DOM.
  const anchorPrototype: HTMLAnchorElement = Object.getPrototypeOf(document.createElement("a"));
  const spy = spyOn(anchorPrototype, "click").mockImplementation(
    function (this: HTMLAnchorElement) {
      clicks.push({ href: this.href, download: this.getAttribute("download") });
    },
  );
  return { clicks, restore: () => spy.mockRestore() };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

type DownloadScenario = "success" | "denied" | "error" | "unsafe_url";

// Catatan: seluruh HTTP di file ini di-mock (globalThis.fetch). Ini tes presenter/view
// dengan API palsu, bukan tes integrasi nyata. Bukti stack nyata ada di docs/audits/e2e-*.
function createFetchMock(scenario: DownloadScenario = "success"): typeof fetch {
  const handler = async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url = String(input);

    if (url.includes("/metadata")) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
            documentId: "22222222-2222-4222-8222-222222222222",
            author: "Azis",
            rawMetadata: {
              extractor: "mock",
              method: "mock",
              detected: true,
              filename: "laporan-rahasia.pdf",
            },
            extractedAt: "2026-10-22T10:00:00.000Z",
            createdAt: "2026-10-22T10:00:00.000Z",
            updatedAt: "2026-10-22T10:00:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.includes("/preview")) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            filename: "laporan-rahasia.pdf",
            mimeType: "application/pdf",
            previewUrl: "about:blank#preview-fixture",
            fileSize: 1024,
            expiresInSeconds: 300,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.includes("/download")) {
      await new Promise((resolve) => setTimeout(resolve, 50));

      if (scenario === "denied") {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "FORBIDDEN", message: "Access denied" },
          }),
          { status: 403, headers: { "content-type": "application/json" } },
        );
      }
      if (scenario === "error") {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "INTERNAL_ERROR", message: "Internal Error" },
          }),
          { status: 500, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            downloadUrl: scenario === "unsafe_url" ? "javascript:alert(1)" : DOWNLOAD_URL,
            filename: "laporan-rahasia.pdf",
            mimeType: "application/pdf",
            fileSize: 1024,
            expiresInSeconds: 300,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: false }), { status: 404 });
  };

  return Object.assign(handler, { preconnect: (): void => {} });
}

function renderDocumentDetail() {
  const queryClient = makeQueryClient();
  const memoryRouter = createMemoryRouter(
    [
      {
        path: "/documents/:id",
        element: <DocumentDetailView />,
      },
    ],
    { initialEntries: ["/documents/doc-123"] },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthSessionProvider initialSession={memberSession}>
        <RouterProvider router={memoryRouter} />
      </AuthSessionProvider>
    </QueryClientProvider>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Document Detail Download Action (FE-S3-02, mocked HTTP)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  test("AC-09.01: Initiates download successfully when permission allows it", async () => {
    globalThis.fetch = createFetchMock("success");

    await act(async () => {
      renderDocumentDetail();
    });

    expect(
      await screen.findByRole("heading", { level: 1, name: "laporan-rahasia.pdf" }),
    ).toBeTruthy();
    const downloadButton = await screen.findByRole("button", { name: /unduh/i });
    expect(downloadButton.hasAttribute("disabled")).toBe(false);

    const anchor = spyOnAnchorClick();
    try {
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      expect(await screen.findByText("Unduhan dimulai...")).toBeTruthy();
      expect(anchor.clicks).toEqual([{ href: DOWNLOAD_URL, download: "" }]);
      expect(document.querySelector("a[download]")).toBeNull();
    } finally {
      anchor.restore();
    }
  });

  test("Handles 'denied' permission gracefully (HTTP 403)", async () => {
    globalThis.fetch = createFetchMock("denied");

    await act(async () => {
      renderDocumentDetail();
    });

    expect(
      await screen.findByRole("heading", { level: 1, name: "laporan-rahasia.pdf" }),
    ).toBeTruthy();
    const downloadButton = await screen.findByRole("button", { name: /unduh/i });

    const anchor = spyOnAnchorClick();
    try {
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      expect(
        await screen.findByText("Anda tidak memiliki izin mengunduh dokumen ini."),
      ).toBeTruthy();
      expect(downloadButton.hasAttribute("disabled")).toBe(true);
      expect(anchor.clicks).toHaveLength(0);
    } finally {
      anchor.restore();
    }
  });

  test("Handles general server errors during download (HTTP 500)", async () => {
    globalThis.fetch = createFetchMock("error");

    await act(async () => {
      renderDocumentDetail();
    });

    expect(
      await screen.findByRole("heading", { level: 1, name: "laporan-rahasia.pdf" }),
    ).toBeTruthy();
    const downloadButton = await screen.findByRole("button", { name: /unduh/i });

    const anchor = spyOnAnchorClick();
    try {
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      expect(await screen.findByText("Gagal mengunduh dokumen. Coba lagi.")).toBeTruthy();
      expect(anchor.clicks).toHaveLength(0);
      expect(downloadButton.hasAttribute("disabled")).toBe(false);
    } finally {
      anchor.restore();
    }
  });

  test("Rejects non-http(s) download URLs without triggering a download", async () => {
    globalThis.fetch = createFetchMock("unsafe_url");

    await act(async () => {
      renderDocumentDetail();
    });

    const downloadButton = await screen.findByRole("button", { name: /unduh/i });
    const anchor = spyOnAnchorClick();
    try {
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      expect(await screen.findByText("Gagal mengunduh dokumen. Coba lagi.")).toBeTruthy();
      expect(anchor.clicks).toHaveLength(0);
    } finally {
      anchor.restore();
    }
  });

  test("Announces download status to assistive technology", async () => {
    globalThis.fetch = createFetchMock("success");

    await act(async () => {
      renderDocumentDetail();
    });

    const downloadButton = await screen.findByRole("button", { name: /unduh/i });
    const note = document.getElementById(downloadButton.getAttribute("aria-describedby") ?? "");
    expect(note?.getAttribute("role")).toBe("status");
    expect(note?.getAttribute("aria-live")).toBe("polite");
  });
});

describe("Document detail presenter helpers", () => {
  test("derivePreviewView picks the PDF view only for application/pdf", () => {
    expect(derivePreviewView("application/pdf")).toBe("pdf");
    expect(
      derivePreviewView("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toBe("unsupported");
  });

  test("formatMimeLabel returns readable labels", () => {
    expect(formatMimeLabel("application/pdf")).toBe("PDF");
    expect(
      formatMimeLabel("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toBe("DOCX");
    expect(formatMimeLabel("application/x-unknown")).toBe("tidak dikenal");
  });

  test("isSafeDownloadUrl only accepts http and https", () => {
    expect(isSafeDownloadUrl("https://storage.example/file.pdf")).toBe(true);
    expect(isSafeDownloadUrl("http://localhost/file.pdf")).toBe(true);
    expect(isSafeDownloadUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeDownloadUrl("data:text/html,x")).toBe(false);
    expect(isSafeDownloadUrl("not a url")).toBe(false);
  });
});
