import { permissionCategorySchema, type PermissionCategory } from "@axentra/shared";
import { z } from "zod";
import { apiRequest } from "../../lib/api-client";

export type PermissionCategoryItem = PermissionCategory;

export const permissionCategoryListSchema = z.array(permissionCategorySchema);

export async function listPermissionCategories(limit = 50): Promise<PermissionCategoryItem[]> {
  const boundedLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const params = new URLSearchParams({ limit: String(boundedLimit) });
  return apiRequest(`/permission-categories?${params.toString()}`, permissionCategoryListSchema);
}

export async function updatePermissionCategory(
  categoryId: string,
  downloadEnabled: boolean,
): Promise<PermissionCategoryItem> {
  const safeId = encodeURIComponent(categoryId);
  return apiRequest(`/permission-categories/${safeId}`, permissionCategorySchema, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ downloadEnabled }),
  });
}
