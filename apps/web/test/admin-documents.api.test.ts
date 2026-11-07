import { afterEach, describe, expect, it } from "bun:test";
import {
  archiveAdminDocument,
  deleteAdminDocument,
  getAdminDocument,
  listAdminDocuments,
  unarchiveAdminDocument,
} from "../src/features/admin-documents/admin-documents.api";

function mockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return Object.assign(handler, { preconnect: (): void => {} });
}

describe("admin-documents.api", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("listAdminDocuments parses valid list page", async () => {
    globalThis.fetch = mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                title: "Laporan-Q1.pdf",
                ownerId: "22222222-2222-4222-8222-222222222222",
                ownerName: "Rina Pratama",
                uploadedAt: "2026-04-17T08:00:00.000Z",
                archivedAt: null,
              },
            ],
            meta: { page: 1, limit: 20, total: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    const res = await listAdminDocuments(1, 20);
    expect(res.items).toHaveLength(1);
    const firstItem = res.items[0];
    expect(firstItem?.title).toBe("Laporan-Q1.pdf");
    expect(res.meta.total).toBe(1);
  });

  it("archiveAdminDocument calls archive endpoint with POST", async () => {
    let calledUrl = "";
    let calledMethod = "";
    globalThis.fetch = mockFetch(async (req: RequestInfo | URL, init?: RequestInit) => {
      calledUrl = String(req);
      calledMethod = init?.method ?? "GET";
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            archivedAt: "2026-11-04T03:00:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    await archiveAdminDocument("11111111-1111-4111-8111-111111111111");
    expect(calledUrl).toContain("/admin/documents/11111111-1111-4111-8111-111111111111/archive");
    expect(calledMethod).toBe("POST");
  });

  it("unarchiveAdminDocument calls unarchive endpoint with POST", async () => {
    let calledUrl = "";
    let calledMethod = "";
    globalThis.fetch = mockFetch(async (req: RequestInfo | URL, init?: RequestInit) => {
      calledUrl = String(req);
      calledMethod = init?.method ?? "GET";
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            archivedAt: null,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    await unarchiveAdminDocument("11111111-1111-4111-8111-111111111111");
    expect(calledUrl).toContain("/admin/documents/11111111-1111-4111-8111-111111111111/unarchive");
    expect(calledMethod).toBe("POST");
  });

  it("getAdminDocument returns metadata detail", async () => {
    globalThis.fetch = mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: "11111111-1111-4111-8111-111111111111",
              title: "Laporan-Q1.pdf",
              ownerId: "22222222-2222-4222-8222-222222222222",
              ownerName: "Rina Pratama",
              uploadedAt: "2026-04-17T08:00:00.000Z",
              archivedAt: null,
              categoryId: "33333333-3333-4333-8333-333333333333",
              categoryName: "Keuangan",
              metadata: {
                author: "Siti Rahma",
                extractedAt: "2026-04-17T08:05:00.000Z",
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    const doc = await getAdminDocument("11111111-1111-4111-8111-111111111111");
    expect(doc.categoryName).toBe("Keuangan");
    expect(doc.metadata?.author).toBe("Siti Rahma");
  });

  it("deleteAdminDocument calls DELETE endpoint", async () => {
    let calledMethod = "";
    globalThis.fetch = mockFetch(async (_req: RequestInfo | URL, init?: RequestInit) => {
      calledMethod = init?.method ?? "GET";
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            deletedAt: "2026-11-04T03:05:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    await deleteAdminDocument("11111111-1111-4111-8111-111111111111");
    expect(calledMethod).toBe("DELETE");
  });
});
