import type { z } from "zod";
import { bulkDownloadRequestSchema, recentDocumentSchema, smartTagSchema } from "@axentra/shared";
import type { RecentDocument } from "@axentra/shared";
import { apiDownloadRequest, apiRequest } from "../../lib/api-client";

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
  if (typeof window === "undefined" || typeof window.document === "undefined") {
    return;
  }
  const createObjectURL = window.URL?.createObjectURL?.bind(window.URL) ?? (() => "blob:mock");
  const revokeObjectURL = window.URL?.revokeObjectURL?.bind(window.URL) ?? (() => {});
  const url = createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  window.document.body.appendChild(anchor);
  anchor.click();
  window.document.body.removeChild(anchor);
  revokeObjectURL(url);
}
