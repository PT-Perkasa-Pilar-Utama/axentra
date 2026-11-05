import { z } from "zod";

export const ADMIN_SUMMARY_UPLOAD_WINDOW_DAYS = 7;

export const adminSummaryUsersByRoleSchema = z.object({
  member_team: z.number().int().nonnegative(),
  head_of_team: z.number().int().nonnegative(),
  admin: z.number().int().nonnegative(),
});

export type AdminSummaryUsersByRole = z.infer<typeof adminSummaryUsersByRoleSchema>;

export const adminSummarySchema = z
  .object({
    usersByRole: adminSummaryUsersByRoleSchema,
    totalDocuments: z.number().int().nonnegative(),
    uploadedLast7Days: z.number().int().nonnegative(),
    downloadCount: z.number().int().nonnegative(),
    latestDownloadAt: z.string().datetime().nullable(),
  })
  .refine((summary) => summary.uploadedLast7Days <= summary.totalDocuments, {
    path: ["uploadedLast7Days"],
    message: "uploadedLast7Days tidak boleh melebihi totalDocuments",
  });

export type AdminSummary = z.infer<typeof adminSummarySchema>;

export const adminSummaryResponseSchema = z.object({
  success: z.literal(true),
  data: adminSummarySchema,
});

export type AdminSummaryResponse = z.infer<typeof adminSummaryResponseSchema>;
