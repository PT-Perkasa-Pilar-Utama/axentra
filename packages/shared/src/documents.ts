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
