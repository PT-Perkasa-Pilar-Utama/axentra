import { z } from "zod";
import { recentDocumentSchema, smartTagSchema } from "@axentra/shared";
import type { RecentDocument } from "@axentra/shared";
import { apiDownloadRequest, apiRequest } from "../../lib/api-client";

export type { RecentDocument };

export type SmartTagResponse = z.infer<typeof smartTagSchema>;

// TODO(BE-S3-03): Replace with the backend-approved contract when BE-S3-03 publishes it.
export const bulkDownloadRequestSchema = z.object({
  documentIds: z
    .array(z.string().uuid({ message: "ID dokumen harus berupa UUID yang valid" }))
    .min(1, "Minimal satu dokumen harus dipilih"),
});

export type BulkDownloadRequest = z.infer<typeof bulkDownloadRequestSchema>;

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
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
