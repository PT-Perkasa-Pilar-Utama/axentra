import { describe, expect, it, mock } from "bun:test";
import {
  archiveAdminDocument,
  deleteAdminDocument,
  getAdminDocument,
  listAdminDocuments,
} from "../src/features/admin-documents/admin-documents.api";

describe("admin-documents.api", () => {
  it("listAdminDocuments parses valid list page", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
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
    ) as unknown as typeof fetch;

    try {
      const res = await listAdminDocuments(1, 20);
      expect(res.items).toHaveLength(1);
      const firstItem = res.items[0];
      expect(firstItem?.title).toBe("Laporan-Q1.pdf");
      expect(res.meta.total).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("archiveAdminDocument calls archive endpoint", async () => {
    const originalFetch = globalThis.fetch;
    let calledUrl = "";
    globalThis.fetch = mock(async (req: Request | string) => {
      calledUrl = typeof req === "string" ? req : req.url;
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
    }) as unknown as typeof fetch;

    try {
      await archiveAdminDocument("11111111-1111-4111-8111-111111111111");
      expect(calledUrl).toContain("/admin/documents/11111111-1111-4111-8111-111111111111/archive");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("getAdminDocument returns metadata detail", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
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
    ) as unknown as typeof fetch;

    try {
      const doc = await getAdminDocument("11111111-1111-4111-8111-111111111111");
      expect(doc.categoryName).toBe("Keuangan");
      expect(doc.metadata?.author).toBe("Siti Rahma");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deleteAdminDocument calls DELETE endpoint", async () => {
    const originalFetch = globalThis.fetch;
    let calledMethod = "";
    globalThis.fetch = mock(async (req: Request | string, init?: RequestInit) => {
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
    }) as unknown as typeof fetch;

    try {
      await deleteAdminDocument("11111111-1111-4111-8111-111111111111");
      expect(calledMethod).toBe("DELETE");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
