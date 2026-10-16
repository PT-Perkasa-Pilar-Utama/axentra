import { categorySummarySchema, type CategorySummary } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export type { CategorySummary };

export async function listCategories(limit = 50): Promise<CategorySummary[]> {
  const boundedLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const params = new URLSearchParams({ limit: String(boundedLimit) });
  return apiRequest(`/categories?${params.toString()}`, categorySummarySchema.array());
}
