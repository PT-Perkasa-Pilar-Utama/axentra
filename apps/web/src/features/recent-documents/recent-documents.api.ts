import { recentDocumentSchema } from "@axentra/shared";
import type { RecentDocument } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export type { RecentDocument };

export async function listRecentDocuments(
  page = 1,
  limit = 5,
  /**
   * Active tag IDs from FE-S2-02 filter state.
   * Appended as repeated `tagIds` params now so the presenter can pass state
   * without a breaking change; server-side filtering activates when BE-S2-03 merges.
   */
  tagIds?: readonly string[],
): Promise<RecentDocument[]> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  for (const id of tagIds ?? []) {
    params.append("tagIds", id);
  }
  return apiRequest(`/documents?${params.toString()}`, recentDocumentSchema.array());
}
