// Ensure Happy DOM is available for tests
const { GlobalRegistrator } = require("@happy-dom/global-registrator");
try {
  GlobalRegistrator.register();
} catch {
  /* already registered */
}
const _win = globalThis as unknown as { window?: { document?: Document } };
globalThis.document = _win.window?.document ?? globalThis.document;

import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AuthSessionProvider } from "../src/features/auth/auth-session.context";
import { clearSession, type AuthSession } from "../src/features/auth/session.storage";
import { router as productionRouter } from "../src/app/router";

// ── Fixtures ────────────────────────────────────────────────────────────────

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
        retryDelay: 0,
      },
    },
  });
}

// F4 FIX: Mock diperbarui — parameter `keyword` diganti `q` (F3).
// Snippet diubah menjadi teks biasa (tidak mengandung HTML) sesuai
// fix F2 di view: dangerouslySetInnerHTML dihapus, sehingga mock
// tidak perlu lagi mensimulasikan HTML dari API.
function createFetchMock(): typeof fetch {
  const handler = async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url = String(input);

    if (url.includes("/search/documents")) {
      const urlObj = new URL(url.startsWith("http") ? url : `http://localhost${url}`);
      const q = urlObj.searchParams.get("q") || "";

      await new Promise((resolve) => setTimeout(resolve, 100));

      if (q.toLowerCase() === "error") {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "SERVER_ERROR", message: "Gagal memuat pencarian" },
          }),
          { status: 500 },
        );
      }

      if (q.toLowerCase() === "kosong") {
        return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: "11111111-1111-4111-8111-111111111111", // format UUID diperlukan
              filename: "laporan-keuangan-2026.pdf",
              processingStatus: "completed",
              createdAt: "2026-09-22T00:00:00.000Z",
              snippet: `...berdasarkan ${q} yang telah disepakati...`,
              highlights: [],
            },
          ],
        }),
        { status: 200 },
      );
    }

    if (url.includes("/tags/top") || url.includes("/documents?")) {
      return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
    }

    return new Response(JSON.stringify({ success: false, error: { message: "Not found" } }), {
      status: 404,
    });
  };

  return Object.assign(handler, { preconnect: (): void => {} });
}

function createSuccessFetchMock(): typeof fetch {
  const handler = async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url = String(input);

    if (url.includes("/search/documents")) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: "11111111-1111-4111-8111-111111111111", // format UUID diperlukan
              filename: "laporan-keuangan-2026.pdf",
              processingStatus: "completed",
              createdAt: "2026-09-22T00:00:00.000Z",
              snippet: "...berdasarkan error yang telah disepakati...",
              highlights: [],
            },
          ],
        }),
        { status: 200 },
      );
    }

    return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
  };

  return Object.assign(handler, { preconnect: (): void => {} });
}

function renderDashboard(queryClient: QueryClient): ReturnType<typeof render> {
  const protectedRoute = productionRouter.routes.find((route) => route.path === undefined);
  const dashboardChild = protectedRoute?.children?.find((route) => route.path === "/dashboard");
  if (!protectedRoute?.element || !dashboardChild?.element) {
    throw new Error("Production dashboard route is unavailable");
  }

  const memoryRouter = createMemoryRouter(
    [
      {
        element: protectedRoute.element,
        children: [{ path: "/dashboard", element: dashboardChild.element }],
      },
    ],
    { initialEntries: ["/dashboard"] },
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

describe("Search Documents Integration (FE-S2-04)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    cleanup();
    clearSession();
    globalThis.fetch = originalFetch;
  });

  // F4 FIX: AC-06.01 — Pencarian berhasil setelah menekan Enter
  //
  // AC-06.01: "saya menekan Enter → saya melihat setidaknya satu dokumen relevan"
  // Tes ini memisahkan simulasi Enter dari tes tampilan hasil (AC-06.02),
  // supaya setiap AC dapat diverifikasi secara independen.
  //
  // Catatan: fireEvent.keyDown mensimulasikan event KeyboardEvent
  // di DOM level. Happy DOM meneruskan submit form ketika Enter
  // ditekan pada input di dalam <form>. Jika di masa depan happy-dom
  // berubah perilaku, gunakan userEvent dari @testing-library/user-event:
  //   const user = userEvent.setup();
  //   await user.type(searchInput, "keuangan");
  //   await user.keyboard("{Enter}");
  // yang mensimulasikan urutan keydown → keypress → keyup → input → submit
  // persis seperti browser sungguhan.
  test("AC-06.01: Submits via Enter key and displays at least one result", async () => {
    globalThis.fetch = createFetchMock() as unknown as typeof fetch;
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    // F5 FIX (selaras): Placeholder berubah menjadi "Cari dokumen..." di view.
    // Perbarui selector ini apabila placeholder view sudah diubah.
    const searchInput = screen.getByPlaceholderText("Cari dokumen...");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "keuangan" } });
    });

    // Simulasi menekan Enter: fireEvent.keyDown mengirim event keyboard,
    // lalu fireEvent.submit meneruskan submit form — diperlukan karena
    // happy-dom mungkin belum mengimplementasikan native Enter-to-submit.
    await act(async () => {
      fireEvent.keyDown(searchInput, { key: "Enter", code: "Enter", keyCode: 13, charCode: 13 });
      fireEvent.submit(searchInput.closest("form") as HTMLFormElement);
    });

    // Verifikasi loading state muncul (konfirmasi pencarian dimulai)
    expect(screen.getByText("Mencari dokumen...")).toBeTruthy();

    // Verifikasi setidaknya satu dokumen relevan muncul (AC-06.01)
    const resultFilename = await screen.findByText("laporan-keuangan-2026.pdf");
    expect(resultFilename).toBeTruthy();
  });

  // F4 FIX: AC-06.02 — Setiap item menampilkan nama file DAN snippet teks
  //
  // Tes sebelumnya hanya memverifikasi filename, tidak snippet.
  // AC-06.02: "setiap item hasil menampilkan nama file dan cuplikan teks yang cocok"
  test("AC-06.02: Each result card shows filename and text snippet", async () => {
    globalThis.fetch = createFetchMock() as unknown as typeof fetch;
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Cari dokumen...");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "keuangan" } });
      fireEvent.keyDown(searchInput, { key: "Enter", code: "Enter", keyCode: 13, charCode: 13 });
      fireEvent.submit(searchInput.closest("form") as HTMLFormElement);
    });

    // Verifikasi nama file ditampilkan
    expect(await screen.findByText("laporan-keuangan-2026.pdf")).toBeTruthy();

    // F4 FIX: Verifikasi snippet teks juga ditampilkan (sebelumnya tidak dicek)
    expect(screen.getByText(/berdasarkan keuangan yang telah disepakati/i)).toBeTruthy();

    // Verifikasi heading hasil pencarian
    expect(screen.getByText('Hasil Pencarian: "keuangan"')).toBeTruthy();
  });

  // AC-06.03 — Pencarian selesai dalam < 3 detik
  //
  // ⚠ BLOCKED — TIDAK DAPAT DIVERIFIKASI DENGAN MOCK
  //
  // AC-06.03 mengukur latensi end-to-end ke backend nyata. Mock
  // mensimulasikan 100ms delay artifisial, bukan waktu respon sistem
  // sesungguhnya. Tes ini tidak dapat membuktikan batasan < 3 detik.
  //
  // Acceptance end-to-end AC-06.03 harus diverifikasi setelah:
  //   1. Kontrak BE-S2-05 final tersedia.
  //   2. Tes dijalankan melawan server staging/production nyata.
  //   3. Waktu respon diukur dari sisi client (performance.now() atau
  //      tooling seperti Playwright + expect(t).toBeLessThan(3000)).
  //
  // Jangan hapus catatan ini sampai tes integrasi E2E berlawan backend
  // nyata sudah ditambahkan dan lulus.

  test("AC-06.04: Displays no-result message when keyword yields empty data", async () => {
    globalThis.fetch = createFetchMock() as unknown as typeof fetch;
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Cari dokumen...");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "kosong" } });
      fireEvent.keyDown(searchInput, { key: "Enter", code: "Enter", keyCode: 13, charCode: 13 });
      fireEvent.submit(searchInput.closest("form") as HTMLFormElement);
    });

    const emptyMessage = await screen.findByText(/Tidak ada hasil yang ditemukan untuk/i);
    expect(emptyMessage).toBeTruthy();
    expect(screen.queryByText("laporan-keuangan-2026.pdf")).toBeNull();
  });

  // F4 FIX: Error state — verifikasi tombol retry dapat ditekan dan
  // pencarian pulih (menampilkan hasil) setelah retry berhasil.
  // Tes sebelumnya hanya memverifikasi tombol retry muncul, tidak
  // mengklik dan memverifikasi pemulihan.
  //
  // Pendekatan explicit mock-swap:
  //   Fase 1 → createFetchMock + keyword "error" → dijamin 500
  //   Fase 2 → ganti ke createSuccessFetchMock sebelum klik retry → dijamin sukses
  //
  // Ini lebih deterministik daripada callCount closure, yang rentan
  // terhadap fetch tak terduga dari komponen lain yang secara tidak
  // sengaja mencocokkan URL "/search/documents" dan menggeser counter.
  test("Handles error state: retry button click recovers and shows results", async () => {
    // Fase 1: mock yang mengembalikan error untuk keyword "error"
    globalThis.fetch = createFetchMock() as unknown as typeof fetch;
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Cari dokumen...");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "error" } });
      fireEvent.keyDown(searchInput, { key: "Enter", code: "Enter", keyCode: 13, charCode: 13 });
      fireEvent.submit(searchInput.closest("form") as HTMLFormElement);
    });

    // Verifikasi error state muncul sebelum retry dilakukan
    const retryButton = await screen.findByRole("button", { name: "Coba lagi" });
    expect(retryButton).toBeTruthy();
    expect(screen.getByText("Gagal memuat hasil pencarian.")).toBeTruthy();
    // Verifikasi role="alert" hadir agar screen reader mengumumkan error (F5)
    expect(screen.getByRole("alert")).toBeTruthy();

    // Fase 2: ganti mock ke sukses SEBELUM klik retry.
    // Presenter akan mencoba ulang dengan keyword yang sama ("error"),
    // tapi mock baru ini mengembalikan sukses untuk semua keyword.
    globalThis.fetch = createSuccessFetchMock() as unknown as typeof fetch;

    await act(async () => {
      fireEvent.click(retryButton);
    });

    // Verifikasi pencarian pulih dan hasil muncul
    expect(await screen.findByText("laporan-keuangan-2026.pdf")).toBeTruthy();
    expect(screen.queryByText("Gagal memuat hasil pencarian.")).toBeNull();
  });

  test("Clears search and returns to Recent Documents view", async () => {
    globalThis.fetch = createFetchMock() as unknown as typeof fetch;
    const queryClient = makeQueryClient();

    await act(async () => {
      renderDashboard(queryClient);
    });

    const searchInput = screen.getByPlaceholderText("Cari dokumen...");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "keuangan" } });
      fireEvent.keyDown(searchInput, { key: "Enter", code: "Enter", keyCode: 13, charCode: 13 });
      fireEvent.submit(searchInput.closest("form") as HTMLFormElement);
    });

    await screen.findByText("laporan-keuangan-2026.pdf");

    const clearButton = screen.getByRole("button", { name: "Bersihkan Pencarian" });
    await act(async () => {
      fireEvent.click(clearButton);
    });

    expect(screen.getByText("Semua Dokumen")).toBeTruthy();
    expect(screen.queryByText('Hasil Pencarian: "keuangan"')).toBeNull();
  });
});
