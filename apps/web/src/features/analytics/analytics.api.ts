import { analyticsSummarySchema, type AnalyticsSummary } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export type { AnalyticsSummary };

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  return apiRequest("/analytics/summary", analyticsSummarySchema);
}
