import { describe, expect, it } from "bun:test";

import {
  ANALYTICS_UPLOAD_WINDOW_DAYS,
  analyticsSummaryResponseSchema,
  analyticsSummarySchema,
} from "./analytics";

describe("Analytics Summary shared contract", () => {
  it("validates non-negative summary counts and response envelope", () => {
    const valid = {
      totalDocuments: 12,
      uploadedLast7Days: 5,
    };

    expect(ANALYTICS_UPLOAD_WINDOW_DAYS).toBe(7);
    expect(analyticsSummarySchema.parse(valid)).toEqual(valid);
    expect(analyticsSummaryResponseSchema.parse({ success: true, data: valid })).toEqual({
      success: true,
      data: valid,
    });
  });

  it("allows zero counts and equal total and recent counts", () => {
    expect(
      analyticsSummarySchema.parse({
        totalDocuments: 0,
        uploadedLast7Days: 0,
      }),
    ).toEqual({
      totalDocuments: 0,
      uploadedLast7Days: 0,
    });

    expect(
      analyticsSummarySchema.parse({
        totalDocuments: 4,
        uploadedLast7Days: 4,
      }),
    ).toEqual({
      totalDocuments: 4,
      uploadedLast7Days: 4,
    });
  });

  it("rejects negative numbers, non-integers, and recent counts exceeding totalDocuments", () => {
    expect(
      analyticsSummarySchema.safeParse({
        totalDocuments: -1,
        uploadedLast7Days: 0,
      }).success,
    ).toBe(false);

    expect(
      analyticsSummarySchema.safeParse({
        totalDocuments: 5,
        uploadedLast7Days: -1,
      }).success,
    ).toBe(false);

    expect(
      analyticsSummarySchema.safeParse({
        totalDocuments: 5.5,
        uploadedLast7Days: 2,
      }).success,
    ).toBe(false);

    expect(
      analyticsSummarySchema.safeParse({
        totalDocuments: 3,
        uploadedLast7Days: 4,
      }).success,
    ).toBe(false);
  });
});
