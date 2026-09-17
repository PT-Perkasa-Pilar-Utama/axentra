import { z } from "zod";

export const uploadDocumentResponseSchema = z.object({
  documentId: z.string(),
  status: z.literal("accepted"),
  filename: z.string().optional(),
});

export type UploadDocumentResponse = z.infer<typeof uploadDocumentResponseSchema>;

export const checkDuplicateResponseSchema = z.object({
  isDuplicate: z.boolean(),
  existingDocumentId: z.string().optional(),
  message: z.string().optional(),
});

export type CheckDuplicateResponse = z.infer<typeof checkDuplicateResponseSchema>;

export const supportedMimeTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const supportedExtensions = [".pdf", ".docx"] as const;

export const documentProcessingStatusSchema = z.enum([
  "queued",
  "processing",
  "processed",
  "failed",
]);

export type DocumentProcessingStatus = z.infer<typeof documentProcessingStatusSchema>;

export const documentMetadataSchema = z.object({
  id: z.string(),
  filename: z.string(),
  author: z.string().nullable().optional(),
  format: z.string().optional(),
  sizeBytes: z.number().optional(),
  tags: z.array(z.string()).default([]),
  category: z.string().nullable().optional(),
  uploadDate: z.string().optional(),
  processingStatus: documentProcessingStatusSchema,
});

export type DocumentMetadata = z.infer<typeof documentMetadataSchema>;
