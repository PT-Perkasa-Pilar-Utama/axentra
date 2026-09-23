import { describe, expect, spyOn, test, beforeEach, afterEach } from "bun:test";
import { z } from "zod";
import {
  apiRequest,
  isSuccessEnvelope,
  mergeRequestHeaders,
  getSessionToken,
} from "../src/lib/api-client";

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

describe("F4 — Authorization header injection", () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    Object.defineProperty(globalThis, "sessionStorage", {
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = String(value);
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          for (const key of Object.keys(store)) {
            delete store[key];
          }
        },
      },
      writable: true,
      configurable: true,
    });
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  test("getSessionToken returns null when no token is stored", () => {
    expect(getSessionToken()).toBeNull();
  });

  test("getSessionToken returns the stored token", () => {
    sessionStorage.setItem("axentra_token", "test-bearer-token");
    expect(getSessionToken()).toBe("test-bearer-token");
  });

  test("mergeRequestHeaders injects Authorization when a session token is present", () => {
    sessionStorage.setItem("axentra_token", "my-jwt-token");
    const headers = mergeRequestHeaders();
    expect(headers.get("authorization")).toBe("Bearer my-jwt-token");
  });

  test("mergeRequestHeaders does not inject Authorization when no token is stored", () => {
    const headers = mergeRequestHeaders();
    expect(headers.get("authorization")).toBeNull();
  });

  test("caller-supplied Authorization header takes precedence over session token", () => {
    sessionStorage.setItem("axentra_token", "session-token");
    const headers = mergeRequestHeaders(new Headers({ authorization: "Bearer caller-override" }));
    expect(headers.get("authorization")).toBe("Bearer caller-override");
  });

  test("apiRequest sends Authorization header to protected endpoint when token present", async () => {
    sessionStorage.setItem("axentra_token", "api-test-token");
    let capturedAuthHeader: string | null = null;

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedAuthHeader = new Headers(init?.headers).get("authorization");
        return new Response(JSON.stringify({ success: true, data: { ok: true } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    try {
      await apiRequest("/documents/upload", z.object({ ok: z.boolean() }), { method: "POST" });
      expect(capturedAuthHeader ?? "").toBe("Bearer api-test-token");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
