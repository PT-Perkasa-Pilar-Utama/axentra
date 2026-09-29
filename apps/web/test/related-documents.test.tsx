import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, createMemoryRouter, RouterProvider } from "react-router";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DocumentSummary } from "@axentra/shared";
import { RelatedDocumentsView } from "../src/features/document-detail/related-documents.view";
import type { RelatedDocumentsPresenter } from "../src/features/document-detail/related-documents.presenter";
import { getRelatedDocuments } from "../src/features/document-detail/related-documents.api";
import { DocumentDetailView } from "../src/features/document-detail/document-detail.view";
import { setAuthTokenGetter } from "../src/lib/api-client";

function renderView(presenter: RelatedDocumentsPresenter): string {
  return renderToString(
    createElement(MemoryRouter, null, createElement(RelatedDocumentsView, { presenter })),
  );
}

const basePresenter: RelatedDocumentsPresenter = {
  status: "ready",
  items: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "CustomerAdvise",
      tags: ["Strategy", "AI"],
      href: "/documents/11111111-1111-4111-8111-111111111111",
    },
  ],
  retry: () => {},
};

describe("RelatedDocumentsView (FE-S2-05 / AC-07.01, AC-07.02)", () => {
  test("AC-07.01: renders heading, supplied document tags and detail link", () => {
    const html = renderView(basePresenter);

    expect(html).toContain("Dokumen Terkait");
    expect(html).toContain("CustomerAdvise");
    expect(html).toContain("Strategy");
    expect(html).toContain("AI");
    expect(html).toContain('href="/documents/11111111-1111-4111-8111-111111111111"');
  });

  test("renders loading skeletons without inventing document data", () => {
    const html = renderView({ ...basePresenter, status: "loading", items: [] });

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Memuat dokumen terkait");
    expect(html).not.toContain("CustomerAdvise");
  });

  test("renders honest empty and error recovery states", () => {
    const emptyHtml = renderView({ ...basePresenter, status: "empty", items: [] });
    const errorHtml = renderView({ ...basePresenter, status: "error", items: [] });

    expect(emptyHtml).toContain("Belum ada dokumen dengan tag yang sama.");
    expect(errorHtml).toContain("Dokumen terkait gagal dimuat. Coba muat ulang.");
    expect(errorHtml).toContain("Coba lagi");
  });
});

const sourceId = "22222222-2222-4222-8222-222222222222";
const relatedId = "11111111-1111-4111-8111-111111111111";
const createdAt = "2026-09-29T00:00:00.000Z";
const strategy = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Strategy",
  createdAt,
};
const recommendation: DocumentSummary = {
  id: relatedId,
  title: "CustomerAdvise",
  processingStatus: "completed",
  tags: [strategy],
  createdAt,
  updatedAt: createdAt,
};

const originalFetch = globalThis.fetch;
let client: QueryClient;

function respond(data: unknown): Response {
  return Response.json({ success: true, data });
}

function mockRelated(handler: (id: string, init?: RequestInit) => Promise<Response>): void {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const path = new URL(String(input), "http://localhost").pathname;
      expect(path).toMatch(/^\/api\/v1\/documents\/[^/]+\/(metadata|related)$/);
      const id = path.split("/")[4] ?? "";
      if (path.endsWith("/metadata")) {
        return respond({
          id,
          documentId: id,
          author: "Bessie Cooper",
          extractedAt: createdAt,
          createdAt,
          updatedAt: createdAt,
        });
      }
      return handler(id, init);
    },
    { preconnect: (): void => {} },
  );
}

async function mountDetail(): Promise<ReturnType<typeof createMemoryRouter>> {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const router = createMemoryRouter([{ path: "/documents/:id", element: <DocumentDetailView /> }], {
    initialEntries: [`/documents/${sourceId}`],
  });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  });
  return router;
}

function relatedRegion(): HTMLElement {
  return screen.getByRole("region", { name: "Dokumen Terkait" });
}

afterEach(() => {
  cleanup();
  client?.clear();
  globalThis.fetch = originalFetch;
  setAuthTokenGetter(null);
});

describe("Related documents API and presenter", () => {
  test("requests the document-specific endpoint with auth and validates the shared summary", async () => {
    setAuthTokenGetter(() => "ax_test_related");
    mockRelated(async (id, init) => {
      expect(id).toBe(sourceId);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer ax_test_related");
      return respond([recommendation]);
    });
    expect(await getRelatedDocuments(sourceId)).toEqual([recommendation]);
  });

  test("rejects invalid document IDs without issuing a request", async () => {
    let calls = 0;
    mockRelated(async () => {
      calls += 1;
      return respond([]);
    });
    await expect(getRelatedDocuments("../tags/top")).rejects.toThrow();
    expect(calls).toBe(0);
  });

  test.each([null, {}, [{ ...recommendation, id: "javascript:alert(1)" }]])(
    "rejects malformed successful data: %j",
    async (data) => {
      mockRelated(async () => respond(data));
      await expect(getRelatedDocuments(sourceId)).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
      });
    },
  );

  test("propagates cancellation instead of an empty result", async () => {
    mockRelated(async (_id, init) => {
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return respond([]);
    });
    const controller = new AbortController();
    controller.abort();
    await expect(getRelatedDocuments(sourceId, controller.signal)).rejects.toMatchObject({
      code: "REQUEST_CANCELLED",
    });
  });

  test("keeps metadata visible while recommendations load, then renders the empty state", async () => {
    let resolveRelated: (response: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      resolveRelated = resolve;
    });
    mockRelated(async () => pending);
    await mountDetail();
    expect(await screen.findByText("Bessie Cooper")).toBeTruthy();
    expect(await screen.findByRole("status", { name: "Memuat dokumen terkait" })).toBeTruthy();
    await act(async () => {
      resolveRelated(respond([]));
    });
    expect(await screen.findByText("Belum ada dokumen dengan tag yang sama.")).toBeTruthy();
  });

  test.each([404, 403, 503])(
    "keeps HTTP %i failures distinct from empty and retries successfully",
    async (status) => {
      let failed = true;
      let calls = 0;
      mockRelated(async () => {
        calls += 1;
        return failed
          ? Response.json(
              { success: false, error: { code: "UNAVAILABLE", message: "private backend detail" } },
              { status },
            )
          : respond([recommendation]);
      });
      await mountDetail();
      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(screen.getByText("Bessie Cooper")).toBeTruthy();
      expect(screen.queryByText("Belum ada dokumen dengan tag yang sama.")).toBeNull();
      expect(screen.queryByText("private backend detail")).toBeNull();
      failed = false;
      await act(async () => {
        fireEvent.click(within(relatedRegion()).getByRole("button", { name: "Coba lagi" }));
      });
      expect(await screen.findByRole("link", { name: "Buka CustomerAdvise" })).toBeTruthy();
      expect(calls).toBe(2);
    },
  );

  test("navigates within the app and never reuses recommendations from the previous document", async () => {
    const requests: string[] = [];
    mockRelated(async (id) => {
      requests.push(id);
      return respond(id === sourceId ? [recommendation] : []);
    });
    const router = await mountDetail();
    const link = await screen.findByRole("link", { name: "Buka CustomerAdvise" });
    expect(within(relatedRegion()).getByText("Strategy")).toBeTruthy();
    expect(link.getAttribute("href")).toBe(`/documents/${relatedId}`);
    await act(async () => {
      fireEvent.click(link);
    });
    expect(router.state.location.pathname).toBe(`/documents/${relatedId}`);
    expect(await screen.findByText("Belum ada dokumen dengan tag yang sama.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Buka CustomerAdvise" })).toBeNull();
    expect(requests).toEqual([sourceId, relatedId]);
  });

  test("omits the source document and tagless suggestions; shows at most three unique tags", async () => {
    mockRelated(async () =>
      respond([
        { ...recommendation, id: sourceId, title: "Source document" },
        { ...recommendation, id: strategy.id, title: "Without tags", tags: [] },
        {
          ...recommendation,
          tags: [
            strategy,
            strategy,
            { ...strategy, name: "AI" },
            { ...strategy, name: "Data Science" },
            { ...strategy, name: "Hidden fourth" },
          ],
        },
      ]),
    );
    await mountDetail();
    await screen.findByRole("link", { name: "Buka CustomerAdvise" });
    expect(within(relatedRegion()).getAllByRole("link")).toHaveLength(1);
    expect(within(relatedRegion()).getAllByText("Strategy")).toHaveLength(1);
    expect(within(relatedRegion()).getByText("AI")).toBeTruthy();
    expect(within(relatedRegion()).getByText("Data Science")).toBeTruthy();
    expect(screen.queryByText("Hidden fourth")).toBeNull();
  });

  test("renders untrusted titles and tag text as text, not HTML", async () => {
    mockRelated(async () =>
      respond([
        {
          ...recommendation,
          title: "<img src=x onerror=alert(1)>",
          tags: [{ ...strategy, name: "<script>alert(1)</script>" }],
        },
      ]),
    );
    await mountDetail();
    expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(relatedRegion().querySelector("img, script")).toBeNull();
  });
});
