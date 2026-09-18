import { describe, expect, spyOn, test } from "bun:test";
import { z } from "zod";
import { apiRequest, isSuccessEnvelope, mergeRequestHeaders } from "../src/lib/api-client";

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

describe("API response contract", () => {
  test("requires data on successful envelopes", () => {
    expect(isSuccessEnvelope({ success: true })).toBe(false);
    expect(isSuccessEnvelope({ success: true, data: null })).toBe(true);
  });

  test("preserves Headers instances and caller values", () => {
    const headers = mergeRequestHeaders(new Headers({ "x-request-id": "audit" }));
    expect(headers.get("x-request-id")).toBe("audit");
    expect(headers.get("accept")).toBe("application/json");
  });

  test("rejects a successful envelope with invalid endpoint data", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async (_input: RequestInfo | URL, _init?: RequestInit) => {
        return new Response(JSON.stringify({ success: true, data: { status: 42 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    try {
      await expect(apiRequest("/health", z.object({ status: z.string() }))).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("classifies a caller abort separately from a request timeout", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        return new Response(JSON.stringify({ success: true, data: { status: "ok" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const controller = new AbortController();
    controller.abort();
    try {
      await expect(
        apiRequest("/health", z.object({ status: z.string() }), { signal: controller.signal }),
      ).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
