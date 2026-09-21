import { z } from "zod";

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

export const smartTagSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type SmartTag = z.infer<typeof smartTagSchema>;

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
