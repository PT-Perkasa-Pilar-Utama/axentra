import { z } from "zod";
import { apiRequest } from "../../lib/api-client";

const searchResultItemSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  processingStatus: z.string(),
  createdAt: z.string(),
  snippet: z.string().nullable(),
  highlights: z
    .array(
      z.object({
        start: z.number(),
        end: z.number(),
      }),
    )
    .default([]),
});

export type SearchResultItem = z.infer<typeof searchResultItemSchema>;

export async function searchDocuments(q: string): Promise<SearchResultItem[]> {
  return apiRequest(
    `/search/documents?q=${encodeURIComponent(q)}`,
    z.array(searchResultItemSchema),
  );
}
