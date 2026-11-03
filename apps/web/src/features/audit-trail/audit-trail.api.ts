import {
  DOWNLOAD_AUDIT_DEFAULT_LIMIT,
  DOWNLOAD_AUDIT_DEFAULT_PAGE,
  downloadAuditListQuerySchema,
  downloadAuditEventSchema,
  type DownloadAuditEvent,
  type PaginationMeta,
} from "@axentra/shared";
import { apiRequestPage } from "../../lib/api-client";

export type DownloadAuditPage = {
  items: DownloadAuditEvent[];
  meta: PaginationMeta;
};

export type { DownloadAuditEvent };

export async function listDownloadAuditEvents(
  page = DOWNLOAD_AUDIT_DEFAULT_PAGE,
  limit = DOWNLOAD_AUDIT_DEFAULT_LIMIT,
): Promise<DownloadAuditPage> {
  const query = downloadAuditListQuerySchema.parse({ page, limit });
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) });
  const { data, meta } = await apiRequestPage(
    `/audit/downloads?${params.toString()}`,
    downloadAuditEventSchema.array(),
  );
  return { items: data, meta };
}
