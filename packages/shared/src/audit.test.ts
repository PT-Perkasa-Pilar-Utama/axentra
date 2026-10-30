import { describe, expect, it } from "bun:test";
import {
  DOWNLOAD_AUDIT_DEFAULT_LIMIT,
  DOWNLOAD_AUDIT_DEFAULT_PAGE,
  DOWNLOAD_AUDIT_MAX_LIMIT,
  DOWNLOAD_AUDIT_MAX_PAGE,
  downloadAuditListQuerySchema,
  downloadAuditListResponseSchema,
} from "./audit";

describe("downloadAuditListQuerySchema", () => {
  it("applies default page and limit when query parameters are omitted or blank", () => {
    expect(downloadAuditListQuerySchema.parse({})).toEqual({
      page: DOWNLOAD_AUDIT_DEFAULT_PAGE,
      limit: DOWNLOAD_AUDIT_DEFAULT_LIMIT,
    });
    expect(downloadAuditListQuerySchema.parse({ page: "", limit: "" })).toEqual({
      page: DOWNLOAD_AUDIT_DEFAULT_PAGE,
      limit: DOWNLOAD_AUDIT_DEFAULT_LIMIT,
    });
  });

  it("coerces valid integer strings and accepts boundary values", () => {
    expect(
      downloadAuditListQuerySchema.parse({
        page: String(DOWNLOAD_AUDIT_MAX_PAGE),
        limit: String(DOWNLOAD_AUDIT_MAX_LIMIT),
      }),
    ).toEqual({
      page: DOWNLOAD_AUDIT_MAX_PAGE,
      limit: DOWNLOAD_AUDIT_MAX_LIMIT,
    });
  });

  it("rejects non-positive, out-of-range, non-integer, whitespace, and boolean values", () => {
    expect(downloadAuditListQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(downloadAuditListQuerySchema.safeParse({ page: "-1" }).success).toBe(false);
    expect(
      downloadAuditListQuerySchema.safeParse({ page: String(DOWNLOAD_AUDIT_MAX_PAGE + 1) }).success,
    ).toBe(false);
    expect(downloadAuditListQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(
      downloadAuditListQuerySchema.safeParse({ limit: String(DOWNLOAD_AUDIT_MAX_LIMIT + 1) })
        .success,
    ).toBe(false);
    expect(downloadAuditListQuerySchema.safeParse({ limit: "2.5" }).success).toBe(false);
    expect(downloadAuditListQuerySchema.safeParse({ page: "abc" }).success).toBe(false);
    expect(downloadAuditListQuerySchema.safeParse({ page: "   " }).success).toBe(false);
    expect(downloadAuditListQuerySchema.safeParse({ page: true }).success).toBe(false);
  });
});

describe("downloadAuditListResponseSchema", () => {
  it("validates a paginated download audit response envelope", () => {
    const parsed = downloadAuditListResponseSchema.safeParse({
      success: true,
      data: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          userId: "00000000-0000-4000-8000-000000000002",
          userName: "Rina Pratama",
          userEmail: "rina@axentra.test",
          documentId: "00000000-0000-4000-8000-000000000003",
          documentName: "SOP-Pengadaan-2026.pdf",
          downloadedAt: "2026-04-17T08:30:00.000Z",
        },
      ],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
      },
    });
    expect(parsed.success).toBe(true);
  });
});
