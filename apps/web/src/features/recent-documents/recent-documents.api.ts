import { recentDocumentSchema } from "@axentra/shared";
import type { RecentDocument } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export type { RecentDocument };

export async function listRecentDocuments(
  page = 1,
  limit = 5,
  /**
   * Active tag IDs from FE-S2-02 filter state.
   * Sent as repeated `tagIds` query params so the request shape is ready when
   * BE-S2-03 activates server-side filtering. The server currently ignores
   * these params — filtering is NOT active until BE-S2-03 merges.
   *
   * TODO(BE-S2-03): remove this note once server-side filtering is live.
   * TODO(N1): AC-04.03/04.04 are not fulfilled until BE-S2-03 merges.
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
  // passthrough() preserves extra fields (tags, sizeBytes, category) added by
  // BE-S2-01 before the shared recentDocumentSchema is updated. The presenter
  // reads them defensively via unknown narrowing.
  // TODO(BE-S2-01): remove cast + passthrough once shared schema includes tags.
  return apiRequest(
    `/documents?${params.toString()}`,
    recentDocumentSchema.passthrough().array(),
  ) as unknown as Promise<RecentDocument[]>;
}
