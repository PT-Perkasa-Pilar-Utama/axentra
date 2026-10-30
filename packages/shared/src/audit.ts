import { z } from "zod";
import { paginationMetaSchema } from "./api";
import { downloadAuditEventSchema, type DownloadAuditEvent } from "./document";

export { downloadAuditEventSchema, type DownloadAuditEvent };

export const DOWNLOAD_AUDIT_DEFAULT_PAGE = 1;
export const DOWNLOAD_AUDIT_MAX_PAGE = 1_000;

export const DOWNLOAD_AUDIT_DEFAULT_LIMIT = 20;
export const DOWNLOAD_AUDIT_MAX_LIMIT = 100;

const parsePaginationQueryValue = (value: unknown, fallback: number): unknown => {
  if (value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return Number.NaN;
  return value;
};

export const downloadAuditListQuerySchema = z.object({
  page: z.preprocess(
    (value) => parsePaginationQueryValue(value, DOWNLOAD_AUDIT_DEFAULT_PAGE),
    z.coerce
      .number({ message: "Halaman harus berupa angka" })
      .int({ message: "Halaman harus berupa bilangan bulat" })
      .min(1, { message: "Halaman minimal 1" })
      .max(DOWNLOAD_AUDIT_MAX_PAGE, {
        message: `Halaman maksimal ${DOWNLOAD_AUDIT_MAX_PAGE}`,
      }),
  ),
  limit: z.preprocess(
    (value) => parsePaginationQueryValue(value, DOWNLOAD_AUDIT_DEFAULT_LIMIT),
    z.coerce
      .number({ message: "Limit harus berupa angka" })
      .int({ message: "Limit harus berupa bilangan bulat" })
      .min(1, { message: "Limit minimal 1" })
      .max(DOWNLOAD_AUDIT_MAX_LIMIT, {
        message: `Limit maksimal ${DOWNLOAD_AUDIT_MAX_LIMIT}`,
      }),
  ),
});

export type DownloadAuditListQuery = z.infer<typeof downloadAuditListQuerySchema>;

export const downloadAuditListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(downloadAuditEventSchema),
  meta: paginationMetaSchema,
});

export type DownloadAuditListResponse = z.infer<typeof downloadAuditListResponseSchema>;
