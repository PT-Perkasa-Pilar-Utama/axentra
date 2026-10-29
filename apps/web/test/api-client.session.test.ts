import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { z } from "zod";
import {
  apiDownloadRequest,
  apiRequest,
  DEFAULT_REQUEST_TIMEOUT_MS,
  FILE_TRANSFER_TIMEOUT_MS,
  setAuthTokenGetter,
  setSessionRefresher,
  setUnauthorizedHandler,
} from "../src/lib/api-client";
import { uploadDocuments } from "../src/features/document-upload/document-upload.api";

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

const healthSchema = z.object({ status: z.string() });

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Token kadaluarsa" },
    }),
    { status: 401, headers: { "content-type": "application/json" } },
  );
}

afterEach(() => {
  setAuthTokenGetter(null);
  setUnauthorizedHandler(null);
  setSessionRefresher(null);
});

describe("timeouts (C1)", () => {
  test("default timeouts: 15 detik untuk JSON dan 180 detik untuk transfer berkas", () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(15_000);
    expect(FILE_TRANSFER_TIMEOUT_MS).toBe(180_000);
  });

  test("timeoutMs per panggilan membatalkan permintaan yang macet dengan REQUEST_TIMEOUT", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    try {
      await expect(
        apiRequest("/slow", healthSchema, undefined, { timeoutMs: 20 }),
      ).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("unggahan dokumen mengirim semua file sebagai field 'files' dengan credentials include", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async (_input, init) => {
        capturedInit = init;
        return okResponse({
          message: "File diterima untuk diproses",
          count: 2,
          files: [
            { filename: "a.docx", size: 4, documentType: "docx" },
            { filename: "b.docx", size: 4, documentType: "docx" },
          ],
        });
      }),
    );
    try {
      const files = [
        new File(["aaaa"], "a.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        new File(["bbbb"], "b.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ];
      await uploadDocuments(files);

      expect(capturedInit?.credentials).toBe("include");
      expect(capturedInit?.body).toBeInstanceOf(FormData);
      const body = capturedInit?.body;
      if (!(body instanceof FormData)) throw new Error("Expected FormData body");
      expect(
        body.getAll("files").map((entry) => (entry instanceof File ? entry.name : "")),
      ).toEqual(["a.docx", "b.docx"]);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("credentials (C1)", () => {
  test("setiap permintaan JSON mengirim credentials include", async () => {
    let capturedCredentials: RequestCredentials | undefined;
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async (_input, init) => {
        capturedCredentials = init?.credentials;
        return okResponse({ status: "ok" });
      }),
    );
    try {
      await apiRequest("/health", healthSchema);
      expect(capturedCredentials).toBe("include");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("unduhan berkas juga mengirim credentials include", async () => {
    let capturedCredentials: RequestCredentials | undefined;
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async (_input, init) => {
        capturedCredentials = init?.credentials;
        return new Response("zip-bytes", { status: 200 });
      }),
    );
    try {
      const blob = await apiDownloadRequest("/documents/bulk-download");
      expect(capturedCredentials).toBe("include");
      expect(await blob.text()).toBe("zip-bytes");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("401 recovery: satu refresh lalu satu ulangan (C3)", () => {
  test("refresh sekali lalu ulangi permintaan dengan token baru", async () => {
    let token = "ax_old";
    setAuthTokenGetter(() => token);
    const unauthorizedHandler = mock(() => {});
    setUnauthorizedHandler(unauthorizedHandler);
    const refresher = mock(async () => {
      token = "ax_new";
      return true;
    });
    setSessionRefresher(refresher);

    const seenAuthorization: (string | null)[] = [];
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async (_input, init) => {
        const authorization = new Headers(init?.headers).get("authorization");
        seenAuthorization.push(authorization);
        return authorization === "Bearer ax_new"
          ? okResponse({ status: "ok" })
          : unauthorizedResponse();
      }),
    );
    try {
      const result = await apiRequest("/documents", healthSchema);
      expect(result.status).toBe("ok");
      expect(seenAuthorization).toEqual(["Bearer ax_old", "Bearer ax_new"]);
      expect(refresher).toHaveBeenCalledTimes(1);
      expect(unauthorizedHandler).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("refresh gagal: sign-out lewat unauthorized handler dan tidak ada ulangan", async () => {
    setAuthTokenGetter(() => "ax_old");
    const unauthorizedHandler = mock(() => {});
    setUnauthorizedHandler(unauthorizedHandler);
    setSessionRefresher(async () => false);

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () => unauthorizedResponse()),
    );
    try {
      await expect(apiRequest("/documents", healthSchema)).rejects.toMatchObject({ status: 401 });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("ulangan yang tetap 401 memicu sign-out tepat sekali dan tidak diulang lagi", async () => {
    setAuthTokenGetter(() => "ax_old");
    const unauthorizedHandler = mock(() => {});
    setUnauthorizedHandler(unauthorizedHandler);
    setSessionRefresher(async () => true);

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () => unauthorizedResponse()),
    );
    try {
      await expect(apiRequest("/documents", healthSchema)).rejects.toMatchObject({ status: 401 });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("refresher yang melempar error dihitung sebagai refresh gagal", async () => {
    setAuthTokenGetter(() => "ax_old");
    const unauthorizedHandler = mock(() => {});
    setUnauthorizedHandler(unauthorizedHandler);
    setSessionRefresher(async () => {
      throw new Error("refresh crashed");
    });

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () => unauthorizedResponse()),
    );
    try {
      await expect(apiRequest("/documents", healthSchema)).rejects.toMatchObject({ status: 401 });
      expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("kegagalan selain 401 tidak memicu refresh maupun sign-out", async () => {
    const refresher = mock(async () => true);
    const unauthorizedHandler = mock(() => {});
    setSessionRefresher(refresher);
    setUnauthorizedHandler(unauthorizedHandler);

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan" },
            }),
            { status: 500, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    try {
      await expect(apiRequest("/documents", healthSchema)).rejects.toMatchObject({ status: 500 });
      expect(refresher).not.toHaveBeenCalled();
      expect(unauthorizedHandler).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("unduhan 401 juga di-refresh lalu diulang", async () => {
    let token = "ax_old";
    setAuthTokenGetter(() => token);
    setSessionRefresher(async () => {
      token = "ax_new";
      return true;
    });

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async (_input, init) => {
        const authorization = new Headers(init?.headers).get("authorization");
        return authorization === "Bearer ax_new"
          ? new Response("zip-bytes", { status: 200 })
          : unauthorizedResponse();
      }),
    );
    try {
      const blob = await apiDownloadRequest("/documents/bulk-download");
      expect(await blob.text()).toBe("zip-bytes");
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("endpoint sesi (C3, login/refresh/logout)", () => {
  test("401 pada endpoint sesi tidak refresh, tidak mengulang, dan tidak mengalihkan", async () => {
    setAuthTokenGetter(() => "ax_old");
    const refresher = mock(async () => true);
    const unauthorizedHandler = mock(() => {});
    setSessionRefresher(refresher);
    setUnauthorizedHandler(unauthorizedHandler);

    const seenAuthorization: (string | null)[] = [];
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async (_input, init) => {
        seenAuthorization.push(new Headers(init?.headers).get("authorization"));
        return unauthorizedResponse();
      }),
    );
    try {
      await expect(
        apiRequest("/auth/login", healthSchema, { method: "POST" }, { sessionEndpoint: true }),
      ).rejects.toMatchObject({ status: 401 });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(refresher).not.toHaveBeenCalled();
      expect(unauthorizedHandler).not.toHaveBeenCalled();
      expect(seenAuthorization).toEqual([null]);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
