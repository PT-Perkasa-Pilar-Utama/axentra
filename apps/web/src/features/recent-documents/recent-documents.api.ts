import { recentDocumentSchema } from "@axentra/shared";
import type { RecentDocument } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export type { RecentDocument };

export async function listRecentDocuments(
  page = 1,
  limit = 5,
  tags?: readonly string[],
): Promise<RecentDocument[]> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  for (const tag of tags ?? []) {
    params.append("tags", tag);
  }

  return apiRequest(
    `/documents?${params.toString()}`,
    recentDocumentSchema.passthrough().array(),
  ) as unknown as Promise<RecentDocument[]>;
}
