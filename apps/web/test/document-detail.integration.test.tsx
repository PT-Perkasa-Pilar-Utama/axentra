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

import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
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

function createFetchMock(
  _downloadScenario: "success" | "denied" | "expired" | "error" = "success",
): typeof fetch {
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
            previewUrl: "blob:http://localhost/xyz",
            fileSize: 1024,
            expiresInSeconds: 300,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.includes("/download")) {
      await new Promise((resolve) => setTimeout(resolve, 50));

      if (_downloadScenario === "denied") {
        return new Response(
          JSON.stringify({ success: false, error: { message: "Access denied" } }),
          { status: 403, headers: { "content-type": "application/json" } },
        );
      }
      if (_downloadScenario === "expired") {
        return new Response(
          JSON.stringify({ success: false, error: { message: "Link expired" } }),
          { status: 410, headers: { "content-type": "application/json" } },
        );
      }
      if (_downloadScenario === "error") {
        return new Response(
          JSON.stringify({ success: false, error: { message: "Internal Error" } }),
          { status: 500, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: { downloadUrl: "http://localhost/files/laporan-rahasia.pdf" },
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

describe("Document Detail Download Action (FE-S3-02)", () => {
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

    await act(async () => {
      fireEvent.click(downloadButton);
    });

    expect(await screen.findByText("Unduhan dimulai...")).toBeTruthy();
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

    await act(async () => {
      fireEvent.click(downloadButton);
    });

    expect(await screen.findByText("Anda tidak memiliki izin mengunduh dokumen ini.")).toBeTruthy();
    expect(downloadButton.hasAttribute("disabled")).toBe(true);
  });

  test("Handles 'expired' download links (HTTP 410)", async () => {
    globalThis.fetch = createFetchMock("expired");

    await act(async () => {
      renderDocumentDetail();
    });

    expect(
      await screen.findByRole("heading", { level: 1, name: "laporan-rahasia.pdf" }),
    ).toBeTruthy();
    const downloadButton = await screen.findByRole("button", { name: /unduh/i });

    await act(async () => {
      fireEvent.click(downloadButton);
    });

    expect(await screen.findByText("Sesi kedaluwarsa. Muat ulang halaman.")).toBeTruthy();
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

    await act(async () => {
      fireEvent.click(downloadButton);
    });

    expect(await screen.findByText("Gagal mengunduh dokumen. Coba lagi.")).toBeTruthy();
  });
});
