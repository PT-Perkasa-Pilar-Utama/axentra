import { afterEach, describe, expect, test } from "bun:test";
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

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("requests audit downloads with limit=100 and parses valid response envelope", async () => {
    let requestedUrl = "";
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL): Promise<Response> => {
        requestedUrl = String(input);
        return new Response(JSON.stringify({ success: true, data: [sampleEvent] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      { preconnect: (): void => {} },
    );

    const result = await listDownloadAuditEvents();
    const url = new URL(requestedUrl, "http://localhost");
    expect(url.pathname).toBe("/api/v1/audit/downloads");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(result).toEqual([sampleEvent]);
  });

  test("rejects malformed audit event payloads", async () => {
    globalThis.fetch = Object.assign(
      async (): Promise<Response> =>
        new Response(
          JSON.stringify({
            success: true,
            data: [{ ...sampleEvent, id: "invalid-uuid" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      { preconnect: (): void => {} },
    );

    await expect(listDownloadAuditEvents()).rejects.toBeInstanceOf(ApiClientError);
  });
});
