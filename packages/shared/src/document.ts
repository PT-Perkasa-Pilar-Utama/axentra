import { z } from "zod";
import { paginationMetaSchema } from "./api";
import { MAX_FILTER_TAGS, MAX_TAG_NAME_LENGTH, parseTagsQuery } from "./tags";

export const processingStatusSchema = z.enum(["queued", "processing", "completed", "failed"]);
export type ProcessingStatus = z.infer<typeof processingStatusSchema>;

export const categorySummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  downloadEnabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CategorySummary = z.infer<typeof categorySummarySchema>;

export const documentCategoryResponseSchema = z.object({
  success: z.literal(true),
  data: categorySummarySchema.nullable(),
});
export type DocumentCategoryResponse = z.infer<typeof documentCategoryResponseSchema>;

export const categoriesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(categorySummarySchema),
});
export type CategoriesResponse = z.infer<typeof categoriesResponseSchema>;

export const smartTagSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type SmartTag = z.infer<typeof smartTagSchema>;

export const documentSmartTagsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(smartTagSchema).max(3),
});
export type DocumentSmartTagsResponse = z.infer<typeof documentSmartTagsResponseSchema>;

export const documentMetadataSchema = z.object({
  author: z.string().nullable().optional(),
  extractedAt: z.string().datetime().nullable().optional(),
});
export type DocumentMetadata = z.infer<typeof documentMetadataSchema>;

export const documentMetadataResultSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  author: z.string().nullable(),
  rawMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
  extractedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DocumentMetadataResult = z.infer<typeof documentMetadataResultSchema>;

export const documentIdParamSchema = z.object({
  id: z.string().uuid({ message: "ID dokumen harus berupa UUID yang valid" }),
});
export type DocumentIdParam = z.infer<typeof documentIdParamSchema>;

export const documentFileInfoSchema = z.object({
  id: z.string().uuid(),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  fileExtension: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type DocumentFileInfo = z.infer<typeof documentFileInfoSchema>;

export const recentDocumentSchema = z.object({
  id: z.string().uuid(),
  filename: z.string().min(1),
  processingStatus: processingStatusSchema,
  tags: z.array(smartTagSchema).optional(),
  createdAt: z.string().datetime(),
});
export type RecentDocument = z.infer<typeof recentDocumentSchema>;

export const RELATED_DOCUMENTS_MAX_LIMIT = 20;

export const relatedDocumentSchema = recentDocumentSchema.extend({
  sharedTags: z.array(z.string().min(1)).min(1),
});
export type RelatedDocument = z.infer<typeof relatedDocumentSchema>;

export const relatedDocumentsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(relatedDocumentSchema).max(RELATED_DOCUMENTS_MAX_LIMIT),
});
export type RelatedDocumentsResponse = z.infer<typeof relatedDocumentsResponseSchema>;

const blankQueryValue = (value: unknown, fallback: number): unknown =>
  value === undefined || value === "" ? fallback : value;

export const recentDocumentListQuerySchema = z.object({
  page: z.preprocess(
    (value) => blankQueryValue(value, 1),
    z.coerce.number().int().min(1).max(1_000),
  ),
  limit: z.preprocess(
    (value) => blankQueryValue(value, 20),
    z.coerce.number().int().min(1).max(100),
  ),
  tags: z
    .preprocess(
      parseTagsQuery,
      z
        .array(
          z
            .string()
            .min(1, { message: "Tag tidak boleh kosong" })
            .max(MAX_TAG_NAME_LENGTH, { message: "Nama tag melebihi batas maksimum" }),
        )
        .max(MAX_FILTER_TAGS, { message: "Jumlah filter tag melebihi batas maksimum" })
        .optional(),
    )
    .optional(),
});
export type RecentDocumentListQuery = z.infer<typeof recentDocumentListQuerySchema>;

export const recentDocumentListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(recentDocumentSchema),
  meta: paginationMetaSchema,
});
export type RecentDocumentListResponse = z.infer<typeof recentDocumentListResponseSchema>;

export const documentSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  processingStatus: processingStatusSchema,
  category: categorySummarySchema.nullable().optional(),
  tags: z.array(smartTagSchema).optional(),
  file: documentFileInfoSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DocumentSummary = z.infer<typeof documentSummarySchema>;

export const documentDetailSchema = documentSummarySchema.extend({
  metadata: documentMetadataSchema.nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  canDownload: z.boolean().optional(),
});
export type DocumentDetail = z.infer<typeof documentDetailSchema>;
