import type { z } from "zod";
import {
  bulkDownloadRequestSchema,
  categorySummarySchema,
  recentDocumentSchema,
  smartTagSchema,
} from "@axentra/shared";
import type { CategorySummary, PaginationMeta, RecentDocument } from "@axentra/shared";
import { apiDownloadRequest, apiRequest, apiRequestPage } from "../../lib/api-client";

export type { CategorySummary, RecentDocument };

export type SmartTagResponse = z.infer<typeof smartTagSchema>;

export type RecentDocumentPage = {
  items: RecentDocument[];
  meta: PaginationMeta;
};

export async function listRecentDocuments(
  page = 1,
  limit = 5,
  tags?: readonly string[],
): Promise<RecentDocumentPage> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  for (const tag of tags ?? []) {
    params.append("tags", tag);
  }

  const { data, meta } = await apiRequestPage(
    `/documents?${params.toString()}`,
    recentDocumentSchema.array(),
  );
  return { items: data, meta };
}

export async function getDocumentSmartTags(documentId: string): Promise<SmartTagResponse[]> {
  return apiRequest(`/documents/${documentId}/smart-tags`, smartTagSchema.array());
}

export async function bulkDownloadDocuments(documentIds: readonly string[]): Promise<Blob> {
  const parsed = bulkDownloadRequestSchema.parse({ documentIds: [...documentIds] });
  return apiDownloadRequest("/documents/bulk-download", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(parsed),
  });
}

export function triggerBlobDownload(blob: Blob, filename = "documents.zip"): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function getDocumentCategory(documentId: string): Promise<CategorySummary | null> {
  return apiRequest(`/documents/${documentId}/category`, categorySummarySchema.nullable());
}
