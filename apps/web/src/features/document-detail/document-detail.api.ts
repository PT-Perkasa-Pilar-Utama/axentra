import type { DocumentMetadataResult } from "@axentra/shared";
import { documentMetadataResultSchema } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export function getDocumentMetadata(documentId: string): Promise<DocumentMetadataResult> {
  return apiRequest(`/documents/${documentId}/metadata`, documentMetadataResultSchema);
}

export const getDocumentDetail = getDocumentMetadata;
