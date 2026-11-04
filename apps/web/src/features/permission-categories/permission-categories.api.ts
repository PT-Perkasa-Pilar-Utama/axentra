import {
  PERMISSION_CATEGORIES_DEFAULT_LIMIT,
  PERMISSION_CATEGORIES_MAX_LIMIT,
  permissionCategorySchema,
  type PermissionCategory,
} from "@axentra/shared";
import { z } from "zod";
import { apiRequest } from "../../lib/api-client";

export type PermissionCategoryItem = PermissionCategory;

export const PERMISSION_CATEGORIES_MIN_LIMIT = 1;
export const permissionCategoryListSchema = z.array(permissionCategorySchema);

export async function listPermissionCategories(
  limit: number = PERMISSION_CATEGORIES_DEFAULT_LIMIT,
): Promise<PermissionCategoryItem[]> {
  const boundedLimit = Math.min(
    PERMISSION_CATEGORIES_MAX_LIMIT,
    Math.max(PERMISSION_CATEGORIES_MIN_LIMIT, Math.floor(limit)),
  );
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
