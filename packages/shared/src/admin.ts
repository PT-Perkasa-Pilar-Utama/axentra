import { z } from "zod";
import { paginationMetaSchema } from "./api";

export const ADMIN_SUMMARY_UPLOAD_WINDOW_DAYS = 7;

export const ADMIN_LIST_DEFAULT_PAGE = 1;
export const ADMIN_LIST_MAX_PAGE = 1_000;

export const ADMIN_LIST_DEFAULT_LIMIT = 20;
export const ADMIN_LIST_MAX_LIMIT = 100;

const parsePaginationQueryValue = (value: unknown, fallback: number): unknown => {
  if (value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return Number.NaN;
  return value;
};

export const adminDocumentsListQuerySchema = z.object({
  page: z.preprocess(
    (value) => parsePaginationQueryValue(value, ADMIN_LIST_DEFAULT_PAGE),
    z.coerce
      .number({ message: "Halaman harus berupa angka" })
      .int({ message: "Halaman harus berupa bilangan bulat" })
      .min(1, { message: "Halaman minimal 1" })
      .max(ADMIN_LIST_MAX_PAGE, {
        message: `Halaman maksimal ${ADMIN_LIST_MAX_PAGE}`,
      }),
  ),
  limit: z.preprocess(
    (value) => parsePaginationQueryValue(value, ADMIN_LIST_DEFAULT_LIMIT),
    z.coerce
      .number({ message: "Limit harus berupa angka" })
      .int({ message: "Limit harus berupa bilangan bulat" })
      .min(1, { message: "Limit minimal 1" })
      .max(ADMIN_LIST_MAX_LIMIT, {
        message: `Limit maksimal ${ADMIN_LIST_MAX_LIMIT}`,
      }),
  ),
});

export type AdminDocumentsListQuery = z.infer<typeof adminDocumentsListQuerySchema>;

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

export const adminDocumentListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  ownerId: z.string().uuid().nullable(),
  ownerName: z.string().min(1).nullable(),
  uploadedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
});

export type AdminDocumentListItem = z.infer<typeof adminDocumentListItemSchema>;

export const adminDocumentsListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(adminDocumentListItemSchema),
  meta: paginationMetaSchema,
});

export type AdminDocumentsListResponse = z.infer<typeof adminDocumentsListResponseSchema>;

export const adminDocumentMetadataSchema = z.object({
  author: z.string().nullable(),
  extractedAt: z.string().datetime().nullable(),
});

export type AdminDocumentMetadata = z.infer<typeof adminDocumentMetadataSchema>;

export const adminDocumentDetailSchema = adminDocumentListItemSchema.extend({
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().min(1).nullable(),
  metadata: adminDocumentMetadataSchema.nullable(),
});

export type AdminDocumentDetail = z.infer<typeof adminDocumentDetailSchema>;

export const adminDocumentDetailResponseSchema = z.object({
  success: z.literal(true),
  data: adminDocumentDetailSchema,
});

export type AdminDocumentDetailResponse = z.infer<typeof adminDocumentDetailResponseSchema>;

export const adminArchiveDocumentResultSchema = z.object({
  id: z.string().uuid(),
  archivedAt: z.string().datetime(),
});

export type AdminArchiveDocumentResult = z.infer<typeof adminArchiveDocumentResultSchema>;

export const adminArchiveDocumentResponseSchema = z.object({
  success: z.literal(true),
  data: adminArchiveDocumentResultSchema,
});

export type AdminArchiveDocumentResponse = z.infer<typeof adminArchiveDocumentResponseSchema>;

export const adminUnarchiveDocumentResultSchema = z.object({
  id: z.string().uuid(),
  archivedAt: z.null(),
});

export type AdminUnarchiveDocumentResult = z.infer<typeof adminUnarchiveDocumentResultSchema>;

export const adminUnarchiveDocumentResponseSchema = z.object({
  success: z.literal(true),
  data: adminUnarchiveDocumentResultSchema,
});

export type AdminUnarchiveDocumentResponse = z.infer<typeof adminUnarchiveDocumentResponseSchema>;

export const adminDeleteDocumentResultSchema = z.object({
  id: z.string().uuid(),
  deletedAt: z.string().datetime(),
});

export type AdminDeleteDocumentResult = z.infer<typeof adminDeleteDocumentResultSchema>;

export const adminDeleteDocumentResponseSchema = z.object({
  success: z.literal(true),
  data: adminDeleteDocumentResultSchema,
});

export type AdminDeleteDocumentResponse = z.infer<typeof adminDeleteDocumentResponseSchema>;
