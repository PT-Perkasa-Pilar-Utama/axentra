import { downloadAuditEventSchema, type DownloadAuditEvent } from "@axentra/shared";
import { z } from "zod";
import { apiRequest } from "../../lib/api-client";

export const downloadAuditEventsResponseSchema = z.array(downloadAuditEventSchema);

export type { DownloadAuditEvent };

export async function listDownloadAuditEvents(): Promise<DownloadAuditEvent[]> {
  return apiRequest("/audit/downloads", downloadAuditEventsResponseSchema);
}
