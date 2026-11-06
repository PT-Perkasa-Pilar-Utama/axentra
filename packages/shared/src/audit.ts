import { z } from "zod";
import { paginationMetaSchema } from "./api";
import { pageLimitQueryFields } from "./pagination-query";
import { downloadAuditEventSchema, type DownloadAuditEvent } from "./document";

export { downloadAuditEventSchema, type DownloadAuditEvent };

export const DOWNLOAD_AUDIT_DEFAULT_PAGE = 1;
export const DOWNLOAD_AUDIT_MAX_PAGE = 1_000;

export const DOWNLOAD_AUDIT_DEFAULT_LIMIT = 20;
export const DOWNLOAD_AUDIT_MAX_LIMIT = 100;

export const downloadAuditListQuerySchema = z.object(
  pageLimitQueryFields({
    defaultLimit: DOWNLOAD_AUDIT_DEFAULT_LIMIT,
    maxLimit: DOWNLOAD_AUDIT_MAX_LIMIT,
    maxPage: DOWNLOAD_AUDIT_MAX_PAGE,
  }),
);

export type DownloadAuditListQuery = z.infer<typeof downloadAuditListQuerySchema>;

export const downloadAuditListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(downloadAuditEventSchema),
  meta: paginationMetaSchema,
});

export type DownloadAuditListResponse = z.infer<typeof downloadAuditListResponseSchema>;
