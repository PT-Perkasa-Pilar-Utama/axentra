import { z } from "zod";
import type { DocumentMetadataResult, PreviewDocumentResponse } from "@axentra/shared";
import { documentMetadataResultSchema, previewDocumentResponseSchema } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export const downloadDocumentResponseSchema = z.object({
  downloadUrl: z.string().url(),
});
export type DownloadDocumentResponse = z.infer<typeof downloadDocumentResponseSchema>;

export function getDocumentMetadata(documentId: string): Promise<DocumentMetadataResult> {
  return apiRequest(`/documents/${documentId}/metadata`, documentMetadataResultSchema);
}

export function getDocumentPreview(documentId: string): Promise<PreviewDocumentResponse> {
  return apiRequest(`/documents/${documentId}/preview`, previewDocumentResponseSchema);
}

export function getDocumentDownload(documentId: string): Promise<DownloadDocumentResponse> {
  return apiRequest(`/documents/${documentId}/download`, downloadDocumentResponseSchema);
}

export const getDocumentDetail = getDocumentMetadata;
