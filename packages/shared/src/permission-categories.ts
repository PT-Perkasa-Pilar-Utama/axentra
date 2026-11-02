import { z } from "zod";
import {
  CATEGORIES_DEFAULT_LIMIT,
  CATEGORIES_MAX_LIMIT,
  categorySummarySchema,
  type CategorySummary,
} from "./document";

export const PERMISSION_CATEGORIES_DEFAULT_LIMIT = CATEGORIES_DEFAULT_LIMIT;
export const PERMISSION_CATEGORIES_MAX_LIMIT = CATEGORIES_MAX_LIMIT;

export const permissionCategorySchema = categorySummarySchema;
export type PermissionCategory = CategorySummary;

const parseLimitQueryValue = (value: unknown, fallback: number): unknown => {
  if (value === undefined || value === "") return fallback;
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return Number.NaN;
};

export const permissionCategoriesQuerySchema = z.object({
  limit: z.preprocess(
    (value) => parseLimitQueryValue(value, PERMISSION_CATEGORIES_DEFAULT_LIMIT),
    z.coerce
      .number({ message: "Limit harus berupa angka" })
      .int({ message: "Limit harus berupa bilangan bulat" })
      .min(1, { message: "Limit minimal 1" })
      .max(PERMISSION_CATEGORIES_MAX_LIMIT, {
        message: `Limit maksimal ${PERMISSION_CATEGORIES_MAX_LIMIT}`,
      }),
  ),
});

export type PermissionCategoriesQuery = z.infer<typeof permissionCategoriesQuerySchema>;

export const permissionCategoriesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(permissionCategorySchema).max(PERMISSION_CATEGORIES_MAX_LIMIT),
});

export type PermissionCategoriesResponse = z.infer<typeof permissionCategoriesResponseSchema>;
