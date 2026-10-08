import { z } from "zod";
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

  return apiRequest(`/documents?${params.toString()}`, recentDocumentSchema.array());
}

const smartTagResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().optional(),
});

export async function getDocumentSmartTags(
  documentId: string,
): Promise<{ id: string; name: string }[]> {
  return apiRequest(`/documents/${documentId}/smart-tags`, smartTagResponseSchema.array());
}
