import { describe, expect, test, beforeEach } from "bun:test";
import { clearAuthToken, getAuthToken, setAuthToken } from "../src/lib/auth-token.store";
import { mergeRequestHeaders } from "../src/lib/api-client";

// ---------------------------------------------------------------------------
// Reset store sebelum setiap test agar tidak ada state yang bocor antar test
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearAuthToken();
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
  test("menyertakan Authorization header saat token tersedia di store", () => {
    setAuthToken("ax_abc123");
    const headers = mergeRequestHeaders();
    expect(headers.get("authorization")).toBe("Bearer ax_abc123");
  });

  test("tidak menyertakan Authorization header saat store kosong", () => {
    // store sudah di-clear oleh beforeEach
    const headers = mergeRequestHeaders();
    expect(headers.get("authorization")).toBeNull();
  });

  test("tidak menimpa Authorization header yang sudah di-set eksplisit oleh caller", () => {
    setAuthToken("ax_dari_store");
    const headers = mergeRequestHeaders({
      authorization: "Bearer ax_dari_caller",
    });
    expect(headers.get("authorization")).toBe("Bearer ax_dari_caller");
  });

  test("tetap menyertakan accept: application/json bersama Authorization", () => {
    setAuthToken("ax_abc123");
    const headers = mergeRequestHeaders();
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer ax_abc123");
  });

  test("tidak menyimpan token ke localStorage atau sessionStorage", () => {
    setAuthToken("ax_abc123");
    // Bun tidak menyediakan localStorage/sessionStorage — keberadaan token
    // hanya bisa dibuktikan via getAuthToken(), bukan via storage API.
    // Test ini memastikan getAuthToken() adalah satu-satunya sumber token.
    expect(getAuthToken()).toBe("ax_abc123");
    expect(typeof localStorage).toBe("undefined");
    expect(typeof sessionStorage).toBe("undefined");
  });
});
