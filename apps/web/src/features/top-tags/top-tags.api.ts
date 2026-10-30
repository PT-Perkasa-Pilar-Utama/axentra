import { topTagSchema } from "@axentra/shared";
import type { TopTag, TopTagsQuery } from "@axentra/shared";

import { apiRequest } from "../../lib/api-client";

export type { TopTag, TopTagsQuery };

export type TopTagsContext = TopTagsQuery["context"];

export type GetTopTagsParams = TopTagsQuery;

export async function getTopTags(params: GetTopTagsParams): Promise<TopTag[]> {
  const query = new URLSearchParams({ context: params.context });
  if (params.limit != null) query.set("limit", String(params.limit));

  for (const id of params.documentIds ?? []) {
    query.append("documentIds", id);
  }

  return apiRequest(`/tags/top?${query.toString()}`, topTagSchema.array());
}
