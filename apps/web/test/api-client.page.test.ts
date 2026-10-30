import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { z } from "zod";
import {
  ApiClientError,
  apiRequestPage,
  setAuthTokenGetter,
  setSessionRefresher,
  setUnauthorizedHandler,
} from "../src/lib/api-client";

const itemSchema = z.object({ id: z.string() });

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  setAuthTokenGetter(null);
  setUnauthorizedHandler(null);
  setSessionRefresher(null);
});

describe("apiRequestPage", () => {
  test("returns the parsed data together with the pagination meta", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () =>
        jsonResponse({
          success: true,
          data: [{ id: "doc-1" }],
          meta: { page: 2, limit: 5, total: 11 },
        }),
      ),
    );
    try {
      const result = await apiRequestPage("/documents?page=2&limit=5", z.array(itemSchema));
      expect(result).toEqual({ data: [{ id: "doc-1" }], meta: { page: 2, limit: 5, total: 11 } });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("rejects a success envelope that has no meta as INVALID_RESPONSE", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () => jsonResponse({ success: true, data: [] })),
    );
    try {
      await expect(apiRequestPage("/documents", z.array(itemSchema))).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test.each([
    ["page 0", { page: 0, limit: 5, total: 3 }],
    ["negative total", { page: 1, limit: 5, total: -1 }],
    ["non-integer limit", { page: 1, limit: 2.5, total: 3 }],
  ])("rejects meta with %s as INVALID_RESPONSE", async (_label, meta) => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () => jsonResponse({ success: true, data: [], meta })),
    );
    try {
      await expect(apiRequestPage("/documents", z.array(itemSchema))).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("rejects invalid data even when the meta is valid", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () =>
        jsonResponse({ success: true, data: [{ id: 42 }], meta: { page: 1, limit: 5, total: 1 } }),
      ),
    );
    try {
      await expect(apiRequestPage("/documents", z.array(itemSchema))).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("maps an error envelope to ApiClientError with the server code", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () =>
        jsonResponse({ success: false, error: { code: "UPSTREAM_ERROR", message: "Gagal" } }, 503),
      ),
    );
    try {
      const failure = await apiRequestPage("/documents", z.array(itemSchema)).catch(
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(ApiClientError);
      expect(failure).toMatchObject({ code: "UPSTREAM_ERROR", status: 503 });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("sends the bearer token and retries once after a refreshed 401", async () => {
    setAuthTokenGetter(() => "ax_refreshed_token");
    let refreshCalls = 0;
    setSessionRefresher(async () => {
      refreshCalls += 1;
      return true;
    });
    const seenAuthorization: (string | null)[] = [];
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async (_input, init) => {
        seenAuthorization.push(new Headers(init?.headers).get("authorization"));
        if (seenAuthorization.length === 1) {
          return jsonResponse(
            { success: false, error: { code: "UNAUTHORIZED", message: "Sesi berakhir" } },
            401,
          );
        }
        return jsonResponse({ success: true, data: [], meta: { page: 1, limit: 5, total: 0 } });
      }),
    );
    try {
      const result = await apiRequestPage("/documents", z.array(itemSchema));
      expect(result).toEqual({ data: [], meta: { page: 1, limit: 5, total: 0 } });
      expect(refreshCalls).toBe(1);
      expect(seenAuthorization).toEqual(["Bearer ax_refreshed_token", "Bearer ax_refreshed_token"]);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
