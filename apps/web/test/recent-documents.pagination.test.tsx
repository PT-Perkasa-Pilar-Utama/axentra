import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { RecentDocumentsView } from "../src/features/recent-documents/recent-documents.view";
import { useRecentDocumentsPresenter } from "../src/features/recent-documents/recent-documents.presenter";

const PAGE_SIZE = 5;
const createdAt = "2026-09-25T12:00:00.000Z";
const originalFetch = globalThis.fetch;

type ListedDocument = { id: string; filename: string };

let corpus: ListedDocument[] = [];
let listRequests: string[] = [];

function makeDocuments(count: number): ListedDocument[] {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return {
      id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
      filename: `dokumen-${String(number).padStart(2, "0")}.pdf`,
    };
  });
}

// Mock server: memotong daftar sesuai page/limit dan mengembalikan meta.total seperti API.
function installApi(): void {
  listRequests = [];
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL): Promise<Response> => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/v1/documents") {
        listRequests.push(url.search);
        const page = Number(url.searchParams.get("page"));
        const limit = Number(url.searchParams.get("limit"));
        const data = corpus
          .slice((page - 1) * limit, page * limit)
          .map((doc) => ({ ...doc, processingStatus: "completed", createdAt }));
        return Response.json({ success: true, data, meta: { page, limit, total: corpus.length } });
      }
      if (url.pathname.endsWith("/smart-tags")) {
        return Response.json({ success: true, data: [] });
      }
      if (url.pathname.endsWith("/category")) {
        return Response.json({ success: true, data: null });
      }
      return Response.json(
        { success: false, error: { code: "NOT_FOUND", message: "Tidak ditemukan" } },
        { status: 404 },
      );
    },
    { preconnect: (): void => {} },
  );
}

function PagedDocuments(): React.JSX.Element {
  const presenter = useRecentDocumentsPresenter(PAGE_SIZE, []);
  return (
    <>
      <button type="button" onClick={() => void presenter.refresh()}>
        Segarkan daftar
      </button>
      <RecentDocumentsView presenter={presenter} />
    </>
  );
}

function renderPagedList(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PagedDocuments />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function clickNext(): void {
  fireEvent.click(screen.getByRole("button", { name: "Halaman berikutnya" }));
}

function clickPrevious(): void {
  fireEvent.click(screen.getByRole("button", { name: "Halaman sebelumnya" }));
}

function isDisabled(name: string): boolean {
  return screen.getByRole("button", { name }).hasAttribute("disabled");
}

function isChecked(name: string): boolean {
  const element = screen.getByRole("checkbox", { name });
  if (!(element instanceof HTMLInputElement)) throw new Error(`Bukan checkbox: ${name}`);
  return element.checked;
}

describe("Recent documents pagination", () => {
  beforeEach(() => {
    corpus = makeDocuments(11);
    installApi();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  test("requests the first page with page=1 and limit=5", async () => {
    renderPagedList();

    expect(await screen.findByText("Halaman 1 dari 3")).toBeTruthy();
    expect(listRequests[0]).toBe("?page=1&limit=5");
    expect(screen.getByRole("checkbox", { name: "Pilih dokumen-01.pdf" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Pilih dokumen-06.pdf" })).toBeNull();
    expect(isDisabled("Halaman sebelumnya")).toBe(true);
    expect(isDisabled("Halaman berikutnya")).toBe(false);
  });

  test("Next requests page 2 and shows the page indicator", async () => {
    renderPagedList();
    await screen.findByText("Halaman 1 dari 3");

    clickNext();

    expect(await screen.findByText("Halaman 2 dari 3")).toBeTruthy();
    expect(listRequests).toContain("?page=2&limit=5");
    expect(screen.getByRole("checkbox", { name: "Pilih dokumen-06.pdf" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Pilih dokumen-01.pdf" })).toBeNull();
    expect(isDisabled("Halaman sebelumnya")).toBe(false);
  });

  test("Previous goes back to the previous page", async () => {
    renderPagedList();
    await screen.findByText("Halaman 1 dari 3");
    clickNext();
    await screen.findByText("Halaman 2 dari 3");

    clickPrevious();

    expect(await screen.findByText("Halaman 1 dari 3")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Pilih dokumen-01.pdf" })).toBeTruthy();
    expect(isDisabled("Halaman sebelumnya")).toBe(true);
  });

  test("Next is disabled on the last page", async () => {
    renderPagedList();
    await screen.findByText("Halaman 1 dari 3");
    clickNext();
    await screen.findByText("Halaman 2 dari 3");
    clickNext();

    expect(await screen.findByText("Halaman 3 dari 3")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Pilih dokumen-11.pdf" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Pilih dokumen-10.pdf" })).toBeNull();
    expect(isDisabled("Halaman berikutnya")).toBe(true);
    expect(isDisabled("Halaman sebelumnya")).toBe(false);
  });

  test("clamps the current page when the total shrinks after a refresh", async () => {
    renderPagedList();
    await screen.findByText("Halaman 1 dari 3");
    clickNext();
    await screen.findByText("Halaman 2 dari 3");
    clickNext();
    await screen.findByText("Halaman 3 dari 3");

    corpus = makeDocuments(4);
    fireEvent.click(screen.getByRole("button", { name: "Segarkan daftar" }));

    expect(await screen.findByText("Halaman 1 dari 1")).toBeTruthy();
    expect(await screen.findByRole("checkbox", { name: "Pilih dokumen-01.pdf" })).toBeTruthy();
    expect(listRequests.at(-1)).toBe("?page=1&limit=5");
    expect(isDisabled("Halaman berikutnya")).toBe(true);
    expect(isDisabled("Halaman sebelumnya")).toBe(true);
  });

  test("clears the bulk selection when the page changes", async () => {
    renderPagedList();
    await screen.findByText("Halaman 1 dari 3");
    fireEvent.click(screen.getByRole("checkbox", { name: "Pilih dokumen-01.pdf" }));
    expect(isChecked("Pilih dokumen-01.pdf")).toBe(true);
    expect(isDisabled("Download Selected")).toBe(false);

    clickNext();
    await screen.findByText("Halaman 2 dari 3");
    expect(isDisabled("Download Selected")).toBe(true);

    clickPrevious();
    await screen.findByText("Halaman 1 dari 3");
    expect(isChecked("Pilih dokumen-01.pdf")).toBe(false);
    expect(isDisabled("Download Selected")).toBe(true);
  });
});
