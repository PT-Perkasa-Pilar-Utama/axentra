import {
  documentIdParamSchema,
  documentSummarySchema,
  type DocumentSummary,
} from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export async function getRelatedDocuments(
  documentId: string,
  signal?: AbortSignal,
): Promise<DocumentSummary[]> {
  const { id } = documentIdParamSchema.parse({ id: documentId });
  // TODO(BE-S2-06): Confirm the response shape with the backend; reuse the shared summary for now.
  return apiRequest(`/documents/${encodeURIComponent(id)}/related`, documentSummarySchema.array(), {
    signal: signal ?? null,
  });
}
