import {
  documentIdParamSchema,
  relatedDocumentsResponseSchema,
  type RelatedDocument,
} from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export async function getRelatedDocuments(
  documentId: string,
  signal?: AbortSignal,
): Promise<RelatedDocument[]> {
  const { id } = documentIdParamSchema.parse({ id: documentId });
  return apiRequest(
    `/documents/${encodeURIComponent(id)}/related`,
    relatedDocumentsResponseSchema.shape.data,
    { signal: signal ?? null },
  );
}
