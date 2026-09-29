import { z } from "zod";

import { apiRequest } from "../../lib/api-client";

const topTagSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  documentCount: z.number().int().min(0),
});

export type TopTag = z.infer<typeof topTagSchema>;

// "dashboard" ranks across all completed documents.
// "search" ranks across current-page result IDs (FE-S2-04).
export type TopTagsContext = "dashboard" | "search";

export type GetTopTagsParams = {
  context: TopTagsContext;
  limit?: number;
  // Only for context=search (max 100). Omit entirely for context=dashboard.
  documentIds?: string[];
};

export async function getTopTags(params: GetTopTagsParams): Promise<TopTag[]> {
  const query = new URLSearchParams({ context: params.context });
  if (params.limit != null) query.set("limit", String(params.limit));
  // documentIds uses repeated keys: ?documentIds=uuid1&documentIds=uuid2
  for (const id of params.documentIds ?? []) {
    query.append("documentIds", id);
  }
  return apiRequest(`/tags/top?${query.toString()}`, z.array(topTagSchema));
}
