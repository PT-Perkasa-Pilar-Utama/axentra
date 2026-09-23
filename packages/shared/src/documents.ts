import { z } from "zod";

export const SUPPORTED_DOCUMENT_EXTENSIONS = [".pdf", ".docx"] as const;
export type SupportedDocumentExtension = (typeof SUPPORTED_DOCUMENT_EXTENSIONS)[number];

export const SUPPORTED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export type SupportedDocumentMimeType = (typeof SUPPORTED_DOCUMENT_MIME_TYPES)[number];

export const DOCUMENT_TYPES = ["pdf", "docx"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_AGGREGATE_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_DOCX_BATCH_COUNT = 10;

export const DOCUMENT_ERROR_CODES = {
  UNSUPPORTED_FILE_TYPE: "UNSUPPORTED_FILE_TYPE",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  DUPLICATE_DOCUMENT: "DUPLICATE_DOCUMENT",
  PROCESSING_UNAVAILABLE: "PROCESSING_UNAVAILABLE",
} as const;

export const PROCESSING_ENQUEUE_FAILURE_MESSAGE = "Antrean pemrosesan dokumen tidak tersedia";
export type DocumentErrorCode = (typeof DOCUMENT_ERROR_CODES)[keyof typeof DOCUMENT_ERROR_CODES];

export const DOCUMENT_COPY = {
  UPLOAD_ACCEPTED: "File diterima untuk diproses",
  UNSUPPORTED_TYPE: "Tipe file tidak didukung",
  DUPLICATE_WARNING: "File ini sudah ada",
  FILE_TOO_LARGE: "Ukuran file melebihi batas maksimum",
  SINGLE_PDF_ONLY: "Hanya satu file PDF yang dapat diunggah",
  EMPTY_FILE: "File tidak boleh kosong",
  NO_FILES: "Tidak ada file yang diunggah",
  NO_FILES_SELECTED: "Tidak ada file yang dipilih",
  MIXED_TYPES_NOT_ALLOWED: "Tidak dapat mengunggah file PDF dan DOCX secara bersamaan",
  EXCEEDS_DOCX_BATCH_LIMIT: `Maksimal ${MAX_DOCX_BATCH_COUNT} file DOCX yang dapat diunggah sekaligus`,
  GENERIC_ERROR: "Gagal mengunggah file",
} as const;

export const DOCUMENT_MIME_ALLOWLIST_BY_TYPE: Record<DocumentType, ReadonlyArray<string>> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
};

export function getDocumentExtension(filename: string): string {
  const normalized = filename.trim().toLowerCase();
  const lastDotIndex = normalized.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === normalized.length - 1) {
    return "";
  }
  return normalized.slice(lastDotIndex);
}

export function isSupportedDocumentExtension(
  extension: string,
): extension is SupportedDocumentExtension {
  const normalized = extension.trim().toLowerCase();
  return SUPPORTED_DOCUMENT_EXTENSIONS.some((ext) => ext === normalized);
}

export function isSupportedDocumentMimeType(
  mimeType: string,
): mimeType is SupportedDocumentMimeType {
  const normalized = mimeType.trim().toLowerCase();
  return SUPPORTED_DOCUMENT_MIME_TYPES.some((mime) => mime === normalized);
}

export function getDocumentTypeFromFilename(filename: string): DocumentType | null {
  const ext = getDocumentExtension(filename);
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  return null;
}

export const documentUploadFileMetaSchema = z.object({
  filename: z.string().min(1),
  size: z.number().int().min(1).max(MAX_DOCUMENT_FILE_SIZE_BYTES),
  documentType: z.enum(DOCUMENT_TYPES),
});
export type DocumentUploadFileMeta = z.infer<typeof documentUploadFileMetaSchema>;

export const documentUploadAcceptedDataSchema = z.object({
  message: z.literal(DOCUMENT_COPY.UPLOAD_ACCEPTED),
  count: z.number().int().min(1),
  files: z.array(documentUploadFileMetaSchema).min(1),
});
export type DocumentUploadAcceptedData = z.infer<typeof documentUploadAcceptedDataSchema>;

// Aliases and compatibility exports
export const uploadDocumentResponseSchema = documentUploadAcceptedDataSchema;
export type UploadDocumentResponse = DocumentUploadAcceptedData;

export const supportedExtensions = SUPPORTED_DOCUMENT_EXTENSIONS;
export const supportedMimeTypes = SUPPORTED_DOCUMENT_MIME_TYPES;

export const checkDuplicateResponseSchema = z.object({
  isDuplicate: z.boolean(),
  existingDocumentId: z.string().optional(),
  message: z.string().optional(),
});
export type CheckDuplicateResponse = z.infer<typeof checkDuplicateResponseSchema>;

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
