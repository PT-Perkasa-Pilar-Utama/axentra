import type { DocumentMetadata } from "@axentra/shared";
import { documentMetadataSchema } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export function getDocumentDetail(documentId: string): Promise<DocumentMetadata> {
  return apiRequest(`/api/v1/documents/${documentId}`, documentMetadataSchema);
}
