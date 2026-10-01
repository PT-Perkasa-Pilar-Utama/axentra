import { z } from "zod";
import { apiRequest } from "../../lib/api-client";

const searchResultItemSchema = z.object({
  id: z.string(),
  filename: z.string(),
  snippet: z.string(),
});

export type SearchResultItem = z.infer<typeof searchResultItemSchema>;

export async function searchDocuments(keyword: string): Promise<SearchResultItem[]> {
  return apiRequest(
    `/search/documents?q=${encodeURIComponent(keyword)}`,
    z.array(searchResultItemSchema),
  );
}
