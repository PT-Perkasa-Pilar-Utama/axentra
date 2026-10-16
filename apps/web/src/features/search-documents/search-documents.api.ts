import type { z } from "zod";
import { searchDocumentSchema } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export type SearchResultItem = z.infer<typeof searchDocumentSchema>;

export async function searchDocuments(
  q?: string,
  categoryId?: string,
): Promise<SearchResultItem[]> {
  const params = new URLSearchParams();
  if (q && q.trim().length > 0) params.set("q", q.trim());
  if (categoryId) params.set("categoryId", categoryId);
  return apiRequest(`/search/documents?${params.toString()}`, searchDocumentSchema.array());
}
