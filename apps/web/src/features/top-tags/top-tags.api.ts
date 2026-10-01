import { z } from "zod";
import { topTagSchema } from "@axentra/shared";
import type { TopTag } from "@axentra/shared";

import { apiRequest } from "../../lib/api-client";

export type { TopTag };

export type TopTagsContext = "dashboard" | "search";

export type GetTopTagsParams = {
  context: TopTagsContext;
  limit?: number;
  documentIds?: string[];
};

export async function getTopTags(params: GetTopTagsParams): Promise<TopTag[]> {
  const query = new URLSearchParams({ context: params.context });
  if (params.limit != null) query.set("limit", String(params.limit));

  for (const id of params.documentIds ?? []) {
    query.append("documentIds", id);
  }

  return apiRequest(`/tags/top?${query.toString()}`, z.array(topTagSchema));
}
