import { z } from "zod";
import {
  DOWNLOAD_AUDIT_DEFAULT_LIMIT,
  DOWNLOAD_AUDIT_DEFAULT_PAGE,
  downloadAuditListQuerySchema,
  type PaginationMeta,
} from "@axentra/shared";
import { apiRequest, apiRequestPage } from "../../lib/api-client";

export const adminDocumentSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  ownerId: z.string().uuid().nullable(),
  ownerName: z.string().nullable(),
  uploadedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
});
export type AdminDocument = z.infer<typeof adminDocumentSchema>;

const adminDocumentDetailSchema = adminDocumentSchema.extend({
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
  metadata: z
    .object({
      author: z.string().nullable(),
      extractedAt: z.string().datetime().nullable(),
    })
    .nullable(),
});
export type AdminDocumentDetail = z.infer<typeof adminDocumentDetailSchema>;

export type AdminDocumentsPage = {
  items: AdminDocument[];
  meta: PaginationMeta;
};

const archiveResponseSchema = z.object({
  id: z.string().uuid(),
  archivedAt: z.string().datetime().nullable(),
});
const deleteResponseSchema = z.object({
  id: z.string().uuid(),
  deletedAt: z.string().datetime(),
});

export async function listAdminDocuments(
  page = DOWNLOAD_AUDIT_DEFAULT_PAGE,
  limit = DOWNLOAD_AUDIT_DEFAULT_LIMIT,
): Promise<AdminDocumentsPage> {
  const query = downloadAuditListQuerySchema.parse({ page, limit });
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) });
  const { data, meta } = await apiRequestPage(
    `/admin/documents?${params.toString()}`,
    adminDocumentSchema.array(),
  );
  return { items: data, meta };
}

export async function archiveAdminDocument(id: string): Promise<void> {
  await apiRequest(`/admin/documents/${encodeURIComponent(id)}/archive`, archiveResponseSchema, {
    method: "POST",
  });
}

export async function unarchiveAdminDocument(id: string): Promise<void> {
  await apiRequest(`/admin/documents/${encodeURIComponent(id)}/unarchive`, archiveResponseSchema, {
    method: "POST",
  });
}

export async function deleteAdminDocument(id: string): Promise<void> {
  await apiRequest(`/admin/documents/${encodeURIComponent(id)}`, deleteResponseSchema, {
    method: "DELETE",
  });
}

export async function getAdminDocument(id: string): Promise<AdminDocumentDetail> {
  return apiRequest(`/admin/documents/${encodeURIComponent(id)}`, adminDocumentDetailSchema);
}
