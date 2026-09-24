import { describe, expect, spyOn, test, beforeEach } from "bun:test";
import { z } from "zod";
import { clearAuthToken, getAuthToken, setAuthToken } from "../src/lib/auth-token.store";
import {
  mergeRequestHeaders,
  apiRequest,
  isSuccessEnvelope,
  setAuthTokenGetter,
} from "../src/lib/api-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Reset store sebelum setiap test agar tidak ada state yang bocor antar test
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearAuthToken();
  setAuthTokenGetter(null);
});

// ---------------------------------------------------------------------------
// API response contract — F12
// ---------------------------------------------------------------------------

describe("API response contract", () => {
  test("requires data on successful envelopes", () => {
    expect(isSuccessEnvelope({ success: true })).toBe(false);
    expect(isSuccessEnvelope({ success: true, data: null })).toBe(true);
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

// ---------------------------------------------------------------------------
// auth-token.store
// ---------------------------------------------------------------------------

describe("auth-token.store", () => {
  test("getAuthToken mengembalikan null sebelum setAuthToken dipanggil", () => {
    expect(getAuthToken()).toBeNull();
  });

  test("setAuthToken menyimpan token dan getAuthToken mengembalikannya", () => {
    setAuthToken("ax_test_token");
    expect(getAuthToken()).toBe("ax_test_token");
  });

  test("clearAuthToken menghapus token yang tersimpan", () => {
    setAuthToken("ax_test_token");
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
  });

  test("setAuthToken menimpa token sebelumnya", () => {
    setAuthToken("ax_token_lama");
    setAuthToken("ax_token_baru");
    expect(getAuthToken()).toBe("ax_token_baru");
  });
});

// ---------------------------------------------------------------------------
// mergeRequestHeaders — F8
// ---------------------------------------------------------------------------

describe("mergeRequestHeaders — F8 bearer credential", () => {
  test("menyertakan Authorization header saat token tersedia di session getter", () => {
    setAuthTokenGetter(() => "ax_abc123");
    const headers = mergeRequestHeaders();
    expect(headers.get("authorization")).toBe("Bearer ax_abc123");
  });

  test("tidak menyertakan Authorization header saat session getter kosong", () => {
    setAuthTokenGetter(() => null);
    const headers = mergeRequestHeaders();
    expect(headers.get("authorization")).toBeNull();
  });

  test("tidak menimpa Authorization header yang sudah di-set eksplisit oleh caller", () => {
    setAuthTokenGetter(() => "ax_dari_session");
    const headers = mergeRequestHeaders({
      authorization: "Bearer ax_dari_caller",
    });
    expect(headers.get("authorization")).toBe("Bearer ax_dari_caller");
  });

  test("tetap menyertakan accept: application/json bersama Authorization", () => {
    setAuthTokenGetter(() => "ax_abc123");
    const headers = mergeRequestHeaders();
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer ax_abc123");
  });

  test("menggunakan getter sesi sebagai satu-satunya sumber bearer token", () => {
    setAuthTokenGetter(() => "ax_abc123");
    const headers = mergeRequestHeaders();
    expect(headers.get("authorization")).toBe("Bearer ax_abc123");
    expect(getAuthToken()).toBeNull();
  });
});
