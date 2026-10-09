import type { z } from "zod";
import { recentDocumentSchema, smartTagSchema } from "@axentra/shared";
import type { RecentDocument } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export type { RecentDocument };

export type SmartTagResponse = z.infer<typeof smartTagSchema>;

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

export async function getDocumentSmartTags(documentId: string): Promise<SmartTagResponse[]> {
  return apiRequest(`/documents/${documentId}/smart-tags`, smartTagSchema.array());
}
