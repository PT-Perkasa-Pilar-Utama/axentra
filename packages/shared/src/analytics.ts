import { z } from "zod";

export const ANALYTICS_UPLOAD_WINDOW_DAYS = 7;

export const analyticsSummarySchema = z
  .object({
    totalDocuments: z.number().int().nonnegative(),
    uploadedLast7Days: z.number().int().nonnegative(),
  })
  .refine((summary) => summary.uploadedLast7Days <= summary.totalDocuments, {
    path: ["uploadedLast7Days"],
    message: "uploadedLast7Days tidak boleh melebihi totalDocuments",
  });

export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;

export const analyticsSummaryResponseSchema = z.object({
  success: z.literal(true),
  data: analyticsSummarySchema,
});

export type AnalyticsSummaryResponse = z.infer<typeof analyticsSummaryResponseSchema>;
