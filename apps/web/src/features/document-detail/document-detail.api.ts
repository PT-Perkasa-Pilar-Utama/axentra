import type { DocumentDetail } from "@axentra/shared";
import { documentDetailSchema } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export function getDocumentDetail(documentId: string): Promise<DocumentDetail> {
  return apiRequest(`/documents/${documentId}`, documentDetailSchema);
}
