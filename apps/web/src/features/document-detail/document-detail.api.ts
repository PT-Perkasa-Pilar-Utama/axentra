import type {
  DocumentMetadataResult,
  DownloadDocumentResponse,
  PreviewDocumentResponse,
} from "@axentra/shared";
import {
  documentMetadataResultSchema,
  downloadDocumentResponseSchema,
  previewDocumentResponseSchema,
} from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

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
