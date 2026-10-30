import { afterEach, describe, expect, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MAX_FILTER_TAGS } from "@axentra/shared";
import { useRecentDocumentsPresenter } from "../src/features/recent-documents/recent-documents.presenter";
import { useSearchDocumentsPresenter } from "../src/features/search-documents/search-documents.presenter";
import {
  useTagFilterPresenter,
  useTopTagsPresenter,
} from "../src/features/top-tags/top-tags.presenter";

const originalFetch = globalThis.fetch;
const createdAt = "2026-09-25T12:00:00.000Z";
const strategyId = "11111111-1111-4111-8111-111111111111";
const legalId = "22222222-2222-4222-8222-222222222222";
const gabunganId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const strategiId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const legalOnlyId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type CorpusDocument = { id: string; filename: string; tags: string[] };

const corpus: CorpusDocument[] = [
  { id: gabunganId, filename: "gabungan.pdf", tags: ["Strategy", "Legal"] },
  { id: strategiId, filename: "strategi.pdf", tags: ["Strategy"] },
  { id: legalOnlyId, filename: "legal.pdf", tags: ["Legal"] },
];

const tagIds: Record<string, string> = { Strategy: strategyId, Legal: legalId };

type RequestRecord = { pathname: string; params: URLSearchParams };
let requests: RequestRecord[] = [];

function listedDocument(doc: CorpusDocument): Record<string, unknown> {
  return { id: doc.id, filename: doc.filename, processingStatus: "completed", createdAt };
}

// Mock HTTP yang menerapkan filter tag AND seperti server dan mencatat setiap permintaan.
function mockApi(): void {
  requests = [];
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL): Promise<Response> => {
      const url = new URL(String(input), "http://localhost");
      requests.push({ pathname: url.pathname, params: url.searchParams });
      const tags = url.searchParams.getAll("tags");
      const matched = corpus.filter((doc) => tags.every((tag) => doc.tags.includes(tag)));

      if (url.pathname === "/api/v1/documents") {
        const meta = { page: 1, limit: 5, total: matched.length };
        return Response.json({ success: true, data: matched.map(listedDocument), meta });
      }
      if (url.pathname === "/api/v1/search/documents") {
        return Response.json({
          success: true,
          data: matched.map((doc) => ({ ...listedDocument(doc), snippet: null, highlights: [] })),
        });
      }
      if (url.pathname === "/api/v1/tags/top") {
        const scopeIds = url.searchParams.getAll("documentIds");
        const scope =
          url.searchParams.get("context") === "search"
            ? corpus.filter((doc) => scopeIds.includes(doc.id))
            : corpus;
        const counts = new Map<string, number>();
        for (const doc of scope) {
          for (const tag of doc.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
        return Response.json({
          success: true,
          data: [...counts].map(([name, documentCount]) => ({
            id: tagIds[name],
            name,
            documentCount,
          })),
        });
      }
      return Response.json({ success: true, data: [] });
    },
    { preconnect: (): void => {} },
  );
}

function lastRequest(pathname: string): RequestRecord | undefined {
  return requests.filter((request) => request.pathname === pathname).at(-1);
}

// Daftar tag yang dikirim pada tiap permintaan ke path ini. Dasbor juga memantau dokumen
// pending tanpa filter, jadi cukup memeriksa apakah salah satu permintaan membawa tag yang diharapkan.
function tagsSentTo(pathname: string): string[][] {
  return requests
    .filter((request) => request.pathname === pathname)
    .map((request) => request.params.getAll("tags"));
}

function wrapperFor(client: QueryClient): ({ children }: { children: ReactNode }) => ReactNode {
  return ({ children }) => createElement(QueryClientProvider, { client }, children);
}

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Tag filter presenters (AC-04.03, AC-04.04)", () => {
  test("AC-04.03: a single selected tag narrows the dashboard list request, and toggling it off restores the list", async () => {
    mockApi();
    const client = newClient();
    const { result } = renderHook(
      () => {
        const filter = useTagFilterPresenter();
        const documents = useRecentDocumentsPresenter(5, filter.activeTagList);
        return { filter, documents };
      },
      { wrapper: wrapperFor(client) },
    );
    const names = (): string[] => result.current.documents.items.map((item) => item.filename);

    await waitFor(() => expect(names()).toEqual(["gabungan.pdf", "strategi.pdf", "legal.pdf"]));

    act(() => {
      result.current.filter.toggleTag("Strategy");
    });
    await waitFor(() => expect(names()).toEqual(["gabungan.pdf", "strategi.pdf"]));
    expect(result.current.filter.activeTagNames.has("Strategy")).toBe(true);
    expect(tagsSentTo("/api/v1/documents")).toContainEqual(["Strategy"]);

    act(() => {
      result.current.filter.toggleTag("Strategy");
    });
    await waitFor(() => expect(names()).toEqual(["gabungan.pdf", "strategi.pdf", "legal.pdf"]));
    expect(result.current.filter.activeTagList).toEqual([]);
    expect(tagsSentTo("/api/v1/documents").at(-1)).toEqual([]);
    client.clear();
  });

  test("AC-04.04: several selected tags are sent together in sorted order so the server applies AND logic", async () => {
    mockApi();
    const client = newClient();
    const { result } = renderHook(
      () => {
        const filter = useTagFilterPresenter();
        const documents = useRecentDocumentsPresenter(5, filter.activeTagList);
        return { filter, documents };
      },
      { wrapper: wrapperFor(client) },
    );

    act(() => {
      result.current.filter.toggleTag("Strategy");
      result.current.filter.toggleTag("Legal");
    });

    await waitFor(() =>
      expect(result.current.documents.items.map((item) => item.filename)).toEqual(["gabungan.pdf"]),
    );
    expect(tagsSentTo("/api/v1/documents")).toContainEqual(["Legal", "Strategy"]);
    client.clear();
  });

  test("AC-04.03: a single tag is sent with the search request, and results are narrowed to that tag", async () => {
    mockApi();
    const client = newClient();
    const { result } = renderHook(
      () => {
        const filter = useTagFilterPresenter();
        const search = useSearchDocumentsPresenter(filter.activeTagList);
        return { filter, search };
      },
      { wrapper: wrapperFor(client) },
    );

    act(() => {
      result.current.filter.toggleTag("Strategy");
    });
    act(() => {
      result.current.search.handleInputChange("API");
    });
    act(() => {
      result.current.search.handleSubmit({ preventDefault: () => {} });
    });

    await waitFor(() =>
      expect(result.current.search.results.map((item) => item.filename)).toEqual([
        "gabungan.pdf",
        "strategi.pdf",
      ]),
    );
    const request = lastRequest("/api/v1/search/documents");
    expect(request?.params.get("q")).toBe("API");
    expect(request?.params.getAll("tags")).toEqual(["Strategy"]);
    client.clear();
  });

  test("AC-04.04: multi-tag search narrows results to documents that have every selected tag", async () => {
    mockApi();
    const client = newClient();
    const { result } = renderHook(
      () => {
        const filter = useTagFilterPresenter();
        const search = useSearchDocumentsPresenter(filter.activeTagList);
        return { filter, search };
      },
      { wrapper: wrapperFor(client) },
    );

    act(() => {
      result.current.filter.toggleTag("Legal");
      result.current.filter.toggleTag("Strategy");
    });
    act(() => {
      result.current.search.handleInputChange("API");
    });
    act(() => {
      result.current.search.handleSubmit({ preventDefault: () => {} });
    });

    await waitFor(() =>
      expect(result.current.search.results.map((item) => item.filename)).toEqual(["gabungan.pdf"]),
    );
    expect(lastRequest("/api/v1/search/documents")?.params.getAll("tags")).toEqual([
      "Legal",
      "Strategy",
    ]);
    client.clear();
  });

  test("AC-04.04: the filter stops adding tags once MAX_FILTER_TAGS is reached", () => {
    const { result } = renderHook(() => useTagFilterPresenter());

    act(() => {
      for (let index = 0; index < MAX_FILTER_TAGS + 5; index += 1) {
        result.current.toggleTag(`Tag ${index}`);
      }
    });

    expect(result.current.activeTagList).toHaveLength(MAX_FILTER_TAGS);
  });
});

describe("Top Tags presenter scope (AC-04.01)", () => {
  test("AC-04.01: search-context Top Tags make no request when there are no result documents", async () => {
    mockApi();
    const client = newClient();
    const { result } = renderHook(
      () => useTopTagsPresenter({ context: "search", documentIds: [] }),
      { wrapper: wrapperFor(client) },
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(requests.some((request) => request.pathname === "/api/v1/tags/top")).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.tags).toEqual([]);
    client.clear();
  });

  test("AC-04.01: search-context Top Tags request only the result document ids and list their tags", async () => {
    mockApi();
    const client = newClient();
    const { result } = renderHook(
      () =>
        useTopTagsPresenter({
          context: "search",
          documentIds: [gabunganId, legalOnlyId],
        }),
      { wrapper: wrapperFor(client) },
    );

    await waitFor(() =>
      expect(result.current.tags.map((tag) => tag.name)).toEqual(["Strategy", "Legal"]),
    );
    const request = lastRequest("/api/v1/tags/top");
    expect(request?.params.get("context")).toBe("search");
    expect(request?.params.getAll("documentIds")).toEqual([gabunganId, legalOnlyId]);
    client.clear();
  });

  test("AC-04.03: an active tag stays in Top Tags even when the API list no longer includes it", async () => {
    mockApi();
    const client = newClient();
    const { result } = renderHook(
      () =>
        useTopTagsPresenter({
          context: "search",
          documentIds: [strategiId],
          activeTagNames: ["Legal"],
        }),
      { wrapper: wrapperFor(client) },
    );

    await waitFor(() =>
      expect(result.current.tags.map((tag) => tag.name)).toEqual(["Strategy", "Legal"]),
    );
    client.clear();
  });
});
