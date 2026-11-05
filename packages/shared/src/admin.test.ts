import { describe, expect, it } from "bun:test";
import {
  ADMIN_SUMMARY_UPLOAD_WINDOW_DAYS,
  adminSummaryResponseSchema,
  adminSummarySchema,
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
