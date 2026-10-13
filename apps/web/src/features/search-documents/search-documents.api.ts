import type { z } from "zod";
import { searchDocumentSchema } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export type SearchResultItem = z.infer<typeof searchDocumentSchema>;

export async function searchDocuments(q: string): Promise<SearchResultItem[]> {
  const params = new URLSearchParams({ q });
  return apiRequest(`/search/documents?${params.toString()}`, searchDocumentSchema.array());
}
