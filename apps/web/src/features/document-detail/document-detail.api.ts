import type { DocumentMetadataResult, PreviewDocumentResponse } from "@axentra/shared";
import { documentMetadataResultSchema, previewDocumentResponseSchema } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export function getDocumentMetadata(documentId: string): Promise<DocumentMetadataResult> {
  return apiRequest(`/documents/${documentId}/metadata`, documentMetadataResultSchema);
}

export function getDocumentPreview(documentId: string): Promise<PreviewDocumentResponse> {
  return apiRequest(`/documents/${documentId}/preview`, previewDocumentResponseSchema);
}

export const getDocumentDetail = getDocumentMetadata;
