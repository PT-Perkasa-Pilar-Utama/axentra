import { recentDocumentSchema } from "@axentra/shared";
import type { RecentDocument } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export type { RecentDocument };

export async function listRecentDocuments(page = 1, limit = 5): Promise<RecentDocument[]> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  return apiRequest(`/documents?${params.toString()}`, recentDocumentSchema.array());
}
