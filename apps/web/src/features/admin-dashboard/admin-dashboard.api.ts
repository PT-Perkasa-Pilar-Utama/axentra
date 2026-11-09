import { adminSummarySchema } from "@axentra/shared";
import type { AdminSummary } from "@axentra/shared";

import { apiRequest } from "../../lib/api-client";

const adminSummaryPath = "/admin/summary";

export async function getAdminSummary(): Promise<AdminSummary> {
  return apiRequest(adminSummaryPath, adminSummarySchema);
}
