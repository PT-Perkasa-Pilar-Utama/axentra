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
import { DOWNLOAD_ACCESS_DENIED_MESSAGE, type DocumentDetail } from "@axentra/shared";
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

type DownloadScenario = "success" | "denied" | "error" | "unsafe_url" | "category_disabled";

// Respons GET /documents/:id; canDownload dikirim server berdasarkan kategori dan peran.
function detailFixture(canDownload: boolean): DocumentDetail {
  const timestamp = "2026-10-22T10:00:00.000Z";
  return {
    id: "22222222-2222-4222-8222-222222222222",
    title: "laporan-rahasia.pdf",
    processingStatus: "completed",
    category: canDownload
      ? null
      : {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Keuangan",
          slug: "keuangan",
          downloadEnabled: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
    tags: [],
    metadata: { author: "Azis", extractedAt: timestamp },
    canDownload,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

// Catatan: seluruh HTTP di file ini di-mock (globalThis.fetch). Ini tes presenter/view
// dengan API palsu, bukan tes integrasi nyata. Bukti stack nyata ada di docs/screenshots/FE-S3-02/EVIDENCE.md.
function createFetchMock(scenario: DownloadScenario = "success"): typeof fetch {
  const handler = async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url = String(input);

    if (url.endsWith("/documents/doc-123")) {
      return new Response(
        JSON.stringify({
          success: true,
          data: detailFixture(scenario !== "category_disabled"),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.endsWith("/preview/content")) {
      return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      });
    }

    if (url.includes("/preview")) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            filename: "laporan-rahasia.pdf",
            mimeType: "application/pdf",
            fileSize: 4,
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
    const downloadButton = await screen.findByRole("button", { name: "Download" });
    expect(downloadButton.hasAttribute("disabled")).toBe(false);
    expect(await screen.findByText("Unduh dalam format asli")).toBeTruthy();

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

  test("AC-09.01: every download click requests a fresh signed URL", async () => {
    const base = createFetchMock("success");
    let downloadRequests = 0;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (String(input).includes("/download")) downloadRequests += 1;
        return base(input, init);
      },
      { preconnect: (): void => {} },
    );

    await act(async () => {
      renderDocumentDetail();
    });

    const downloadButton = await screen.findByRole("button", { name: "Download" });
    const anchor = spyOnAnchorClick();
    try {
      await act(async () => {
        fireEvent.click(downloadButton);
      });
      expect(await screen.findByText("Unduhan dimulai...")).toBeTruthy();

      await act(async () => {
        fireEvent.click(downloadButton);
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      expect(downloadRequests).toBe(2);
      expect(anchor.clicks).toHaveLength(2);
    } finally {
      anchor.restore();
    }
  });

  test("AC-09.01: a failed download shows the generic copy, re-enables the button, and recovers on retry", async () => {
    const base = createFetchMock("success");
    let downloadAttempts = 0;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (String(input).includes("/download")) {
          downloadAttempts += 1;
          if (downloadAttempts === 1) {
            return new Response(
              JSON.stringify({
                success: false,
                error: { code: "INTERNAL_ERROR", message: "Internal Error" },
              }),
              { status: 500, headers: { "content-type": "application/json" } },
            );
          }
        }
        return base(input, init);
      },
      { preconnect: (): void => {} },
    );

    await act(async () => {
      renderDocumentDetail();
    });

    const downloadButton = await screen.findByRole("button", { name: "Download" });
    const anchor = spyOnAnchorClick();
    try {
      await act(async () => {
        fireEvent.click(downloadButton);
      });
      expect(await screen.findByText("Unduhan gagal. Silakan coba lagi.")).toBeTruthy();
      expect(downloadButton.hasAttribute("disabled")).toBe(false);
      expect(anchor.clicks).toHaveLength(0);

      await act(async () => {
        fireEvent.click(downloadButton);
      });
      expect(await screen.findByText("Unduhan dimulai...")).toBeTruthy();
      expect(anchor.clicks).toEqual([{ href: DOWNLOAD_URL, download: "" }]);
      expect(downloadAttempts).toBe(2);
    } finally {
      anchor.restore();
    }
  });

  test("AC-09.01: denied download (HTTP 403) keeps the denied copy and disables the button", async () => {
    globalThis.fetch = createFetchMock("denied");

    await act(async () => {
      renderDocumentDetail();
    });

    expect(
      await screen.findByRole("heading", { level: 1, name: "laporan-rahasia.pdf" }),
    ).toBeTruthy();
    const downloadButton = await screen.findByRole("button", { name: "Download" });

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

  test("AC-09.01: general server failure (HTTP 500) shows the generic copy and keeps the button enabled", async () => {
    globalThis.fetch = createFetchMock("error");

    await act(async () => {
      renderDocumentDetail();
    });

    expect(
      await screen.findByRole("heading", { level: 1, name: "laporan-rahasia.pdf" }),
    ).toBeTruthy();
    const downloadButton = await screen.findByRole("button", { name: "Download" });

    const anchor = spyOnAnchorClick();
    try {
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      expect(await screen.findByText("Unduhan gagal. Silakan coba lagi.")).toBeTruthy();
      expect(anchor.clicks).toHaveLength(0);
      expect(downloadButton.hasAttribute("disabled")).toBe(false);
    } finally {
      anchor.restore();
    }
  });

  test("AC-09.01: non-http(s) download URLs are rejected with the generic copy", async () => {
    globalThis.fetch = createFetchMock("unsafe_url");

    await act(async () => {
      renderDocumentDetail();
    });

    const downloadButton = await screen.findByRole("button", { name: "Download" });
    const anchor = spyOnAnchorClick();
    try {
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      expect(await screen.findByText("Unduhan gagal. Silakan coba lagi.")).toBeTruthy();
      expect(anchor.clicks).toHaveLength(0);
    } finally {
      anchor.restore();
    }
  });

  test("AC-05.01: Download is disabled and shows the category denial when canDownload is false", async () => {
    const base = createFetchMock("category_disabled");
    let downloadRequests = 0;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (String(input).includes("/download")) downloadRequests += 1;
        return base(input, init);
      },
      { preconnect: (): void => {} },
    );

    await act(async () => {
      renderDocumentDetail();
    });

    const downloadButton = await screen.findByRole("button", { name: "Download" });
    expect(downloadButton.hasAttribute("disabled")).toBe(true);
    expect(await screen.findByText(DOWNLOAD_ACCESS_DENIED_MESSAGE)).toBeTruthy();
    expect(screen.queryByText("Unduh dalam format asli")).toBeNull();

    const anchor = spyOnAnchorClick();
    try {
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      expect(downloadRequests).toBe(0);
      expect(anchor.clicks).toHaveLength(0);
    } finally {
      anchor.restore();
    }
  });

  test("AC-09.01: download status is announced to assistive technology", async () => {
    globalThis.fetch = createFetchMock("success");

    await act(async () => {
      renderDocumentDetail();
    });

    const downloadButton = await screen.findByRole("button", { name: "Download" });
    const note = document.getElementById(downloadButton.getAttribute("aria-describedby") ?? "");
    expect(note?.getAttribute("role")).toBe("status");
    expect(note?.getAttribute("aria-live")).toBe("polite");
  });
});

describe("Document detail presenter helpers", () => {
  test("derivePreviewView picks the PDF and DOCX text views and leaves other types unsupported", () => {
    expect(derivePreviewView("application/pdf")).toBe("pdf");
    expect(
      derivePreviewView("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toBe("docx");
    expect(derivePreviewView("application/msword")).toBe("unsupported");
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
