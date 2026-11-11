import { describe, expect, it } from "bun:test";
import {
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_DEFAULT_PAGE,
  ADMIN_LIST_MAX_LIMIT,
  ADMIN_LIST_MAX_PAGE,
  ADMIN_SUMMARY_UPLOAD_WINDOW_DAYS,
  adminArchiveDocumentResponseSchema,
  adminDeleteDocumentResponseSchema,
  adminDocumentDetailResponseSchema,
  adminDocumentsListQuerySchema,
  adminDocumentsListResponseSchema,
  adminSummaryResponseSchema,
  adminSummarySchema,
  adminUnarchiveDocumentResponseSchema,
} from "./admin";

describe("Admin schemas (Task BE-S4-05 / PROP-ADM-AC-01.01 to 01.03)", () => {
  it("exports upload window as 7 days", () => {
    expect(ADMIN_SUMMARY_UPLOAD_WINDOW_DAYS).toBe(7);
  });

  it("parses valid admin summary payload", () => {
    const validData = {
      usersByRole: {
        member_team: 10,
        head_of_team: 2,
        admin: 1,
      },
      totalDocuments: 42,
      uploadedLast7Days: 8,
      downloadCount: 120,
      latestDownloadAt: "2026-11-03T07:46:00.000Z",
    };

    const parsed = adminSummarySchema.parse(validData);
    expect(parsed).toEqual(validData);

    const parsedResponse = adminSummaryResponseSchema.parse({
      success: true,
      data: validData,
    });
    expect(parsedResponse.data).toEqual(validData);
  });

  it("accepts null for latestDownloadAt when no downloads exist", () => {
    const dataWithNullDownload = {
      usersByRole: {
        member_team: 0,
        head_of_team: 0,
        admin: 0,
      },
      totalDocuments: 0,
      uploadedLast7Days: 0,
      downloadCount: 0,
      latestDownloadAt: null,
    };

    const parsed = adminSummarySchema.parse(dataWithNullDownload);
    expect(parsed.latestDownloadAt).toBeNull();
  });

  it("rejects when uploadedLast7Days exceeds totalDocuments", () => {
    const invalidData = {
      usersByRole: {
        member_team: 5,
        head_of_team: 1,
        admin: 1,
      },
      totalDocuments: 2,
      uploadedLast7Days: 5,
      downloadCount: 10,
      latestDownloadAt: "2026-11-03T07:46:00.000Z",
    };

    expect(() => adminSummarySchema.parse(invalidData)).toThrow(
      "uploadedLast7Days tidak boleh melebihi totalDocuments",
    );
  });

  it("rejects negative numbers in counts", () => {
    expect(() =>
      adminSummarySchema.parse({
        usersByRole: {
          member_team: -1,
          head_of_team: 0,
          admin: 1,
        },
        totalDocuments: 10,
        uploadedLast7Days: 2,
        downloadCount: 5,
        latestDownloadAt: null,
      }),
    ).toThrow();
  });

  it("rejects missing role key in usersByRole", () => {
    expect(() =>
      adminSummarySchema.parse({
        usersByRole: {
          member_team: 1,
          admin: 1,
        },
        totalDocuments: 10,
        uploadedLast7Days: 2,
        downloadCount: 5,
        latestDownloadAt: null,
      }),
    ).toThrow();
  });

  it("rejects non-datetime string in latestDownloadAt", () => {
    expect(() =>
      adminSummarySchema.parse({
        usersByRole: {
          member_team: 1,
          head_of_team: 1,
          admin: 1,
        },
        totalDocuments: 10,
        uploadedLast7Days: 2,
        downloadCount: 5,
        latestDownloadAt: "not-a-datetime",
      }),
    ).toThrow();
  });
});

describe("Admin document management schemas (Task BE-S4-07 / PROP-ADM-AC-03.01 to 03.05)", () => {
  it("applies default page and limit in adminDocumentsListQuerySchema", () => {
    expect(adminDocumentsListQuerySchema.parse({})).toEqual({
      page: ADMIN_LIST_DEFAULT_PAGE,
      limit: ADMIN_LIST_DEFAULT_LIMIT,
    });
    expect(adminDocumentsListQuerySchema.parse({ page: "", limit: "" })).toEqual({
      page: 1,
      limit: 20,
    });
  });

  it("rejects out-of-range or non-numeric pagination parameters", () => {
    expect(() => adminDocumentsListQuerySchema.parse({ page: 0 })).toThrow();
    expect(() => adminDocumentsListQuerySchema.parse({ page: ADMIN_LIST_MAX_PAGE + 1 })).toThrow();
    expect(() => adminDocumentsListQuerySchema.parse({ limit: 0 })).toThrow();
    expect(() =>
      adminDocumentsListQuerySchema.parse({ limit: ADMIN_LIST_MAX_LIMIT + 1 }),
    ).toThrow();
    expect(() => adminDocumentsListQuerySchema.parse({ page: true })).toThrow();
    expect(() => adminDocumentsListQuerySchema.parse({ limit: "abc" })).toThrow();
  });

  it("parses valid admin documents list response with active, archived, and legacy rows", () => {
    const payload = {
      success: true as const,
      data: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          title: "Laporan-Q1-2026.pdf",
          ownerId: "22222222-2222-4222-8222-222222222222",
          ownerName: "Rina Pratama",
          uploadedAt: "2026-04-17T08:00:00.000Z",
          archivedAt: null,
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
          title: "Dokumen-Lama.pdf",
          ownerId: null,
          ownerName: null,
          uploadedAt: "2026-04-10T08:00:00.000Z",
          archivedAt: "2026-11-04T03:00:00.000Z",
        },
      ],
      meta: {
        page: 1,
        limit: 20,
        total: 2,
      },
    };

    expect(adminDocumentsListResponseSchema.parse(payload)).toEqual(payload);
  });

  it("parses valid admin document detail response and strips uncontracted metadata keys", () => {
    const payload = {
      success: true as const,
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        title: "Laporan-Q1-2026.pdf",
        ownerId: "22222222-2222-4222-8222-222222222222",
        ownerName: "Rina Pratama",
        uploadedAt: "2026-04-17T08:00:00.000Z",
        archivedAt: null,
        categoryId: "33333333-3333-4333-8333-333333333333",
        categoryName: "Reporting",
        metadata: {
          author: "Rina Pratama",
          extractedAt: "2026-04-17T08:01:00.000Z",
          rawMetadata: { producer: "LibreOffice" },
        },
      },
    };

    const parsed = adminDocumentDetailResponseSchema.parse(payload);
    expect(parsed.data.metadata).toEqual({
      author: "Rina Pratama",
      extractedAt: "2026-04-17T08:01:00.000Z",
    });
    expect("rawMetadata" in (parsed.data.metadata ?? {})).toBe(false);
  });

  it("parses archive, unarchive, and soft-delete responses", () => {
    const archived = adminArchiveDocumentResponseSchema.parse({
      success: true,
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        archivedAt: "2026-11-04T03:00:00.000Z",
      },
    });
    expect(archived.data.archivedAt).toBe("2026-11-04T03:00:00.000Z");

    const unarchived = adminUnarchiveDocumentResponseSchema.parse({
      success: true,
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        archivedAt: null,
      },
    });
    expect(unarchived.data.archivedAt).toBeNull();

    const deleted = adminDeleteDocumentResponseSchema.parse({
      success: true,
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        deletedAt: "2026-11-04T03:05:00.000Z",
      },
    });
    expect(deleted.data.deletedAt).toBe("2026-11-04T03:05:00.000Z");
  });
});
