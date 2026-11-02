import { afterEach, describe, expect, test } from "bun:test";
import type { PaginationMeta } from "@axentra/shared";
import { DOWNLOAD_AUDIT_DEFAULT_LIMIT, DOWNLOAD_AUDIT_DEFAULT_PAGE } from "@axentra/shared";
import { listDownloadAuditEvents } from "../src/features/audit-trail/audit-trail.api";
import { ApiClientError } from "../src/lib/api-client";

const sampleEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "aaaaaaaa-1111-4111-8111-111111111111",
  userName: "Aprisal Manuril",
  userEmail: "aprisal@axentra.test",
  documentId: "bbbbbbbb-1111-4111-8111-111111111111",
  documentName: "DocumentCustomer.pdf",
  downloadedAt: "2026-06-18T09:34:00.000Z",
};

describe("audit-trail API", () => {
  const originalFetch = globalThis.fetch;
  const meta: PaginationMeta = { page: 1, limit: 20, total: 35 };

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("requests default server page and returns pagination meta", async () => {
    let requestedUrl = "";
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL): Promise<Response> => {
        requestedUrl = String(input);
        return new Response(JSON.stringify({ success: true, data: [sampleEvent], meta }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      { preconnect: (): void => {} },
    );

    const result = await listDownloadAuditEvents();
    const url = new URL(requestedUrl, "http://localhost");
    expect(url.pathname).toBe("/api/v1/audit/downloads");
    expect(url.searchParams.get("page")).toBe(String(DOWNLOAD_AUDIT_DEFAULT_PAGE));
    expect(url.searchParams.get("limit")).toBe(String(DOWNLOAD_AUDIT_DEFAULT_LIMIT));
    expect(result).toEqual({ items: [sampleEvent], meta });
  });

  test("requests the requested server page and limit", async () => {
    let requestedUrl = "";
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL): Promise<Response> => {
        requestedUrl = String(input);
        return new Response(
          JSON.stringify({
            success: true,
            data: [sampleEvent],
            meta: { page: 3, limit: 25, total: 35 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
      { preconnect: (): void => {} },
    );

    const result = await listDownloadAuditEvents(3, 25);
    const url = new URL(requestedUrl, "http://localhost");
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(result.meta).toEqual({ page: 3, limit: 25, total: 35 });
  });

  test("rejects responses missing valid pagination metadata", async () => {
    globalThis.fetch = Object.assign(
      async (): Promise<Response> =>
        new Response(JSON.stringify({ success: true, data: [sampleEvent] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      { preconnect: (): void => {} },
    );

    await expect(listDownloadAuditEvents()).rejects.toBeInstanceOf(ApiClientError);
  });

  test("rejects invalid server pagination metadata", async () => {
    globalThis.fetch = Object.assign(
      async (): Promise<Response> =>
        new Response(
          JSON.stringify({
            success: true,
            data: [sampleEvent],
            meta: { page: 0, limit: 10, total: -1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      { preconnect: (): void => {} },
    );

    await expect(listDownloadAuditEvents()).rejects.toBeInstanceOf(ApiClientError);
  });

  test("rejects responses with a malformed audit event", async () => {
    globalThis.fetch = Object.assign(
      async (): Promise<Response> =>
        new Response(
          JSON.stringify({ success: true, data: [{ ...sampleEvent, id: "bad" }], meta }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      { preconnect: (): void => {} },
    );

    await expect(listDownloadAuditEvents()).rejects.toBeInstanceOf(ApiClientError);
  });

  test("response exposes total for audit histories beyond one page", async () => {
    const largeMeta = { page: 1, limit: 20, total: 101 };
    globalThis.fetch = Object.assign(
      async (): Promise<Response> =>
        new Response(JSON.stringify({ success: true, data: [sampleEvent], meta: largeMeta }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      { preconnect: (): void => {} },
    );

    const result = await listDownloadAuditEvents(1, 20);
    expect(result.meta.total).toBe(101);
  });

  test("rejects non-array data despite valid metadata", async () => {
    globalThis.fetch = Object.assign(
      async (): Promise<Response> =>
        new Response(JSON.stringify({ success: true, data: null, meta }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      { preconnect: (): void => {} },
    );

    await expect(listDownloadAuditEvents()).rejects.toBeInstanceOf(ApiClientError);
  });
});
