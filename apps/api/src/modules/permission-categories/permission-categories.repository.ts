import { asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { categories, categoryDownloadPermissions } from "@axentra/db";
import {
  PERMISSION_CATEGORIES_DEFAULT_LIMIT,
  PERMISSION_CATEGORIES_MAX_LIMIT,
  type PermissionCategory,
} from "@axentra/shared";

export type IPermissionCategoriesRepository = {
  listPermissionCategories: (limit?: number) => Promise<ReadonlyArray<PermissionCategory>>;
};

export class DrizzlePermissionCategoriesRepository implements IPermissionCategoriesRepository {
  public constructor(private readonly sqlDb: PostgresJsDatabase) {}

  public async listPermissionCategories(
    limit: number = PERMISSION_CATEGORIES_DEFAULT_LIMIT,
  ): Promise<ReadonlyArray<PermissionCategory>> {
    const effectiveLimit = Math.min(Math.max(1, limit), PERMISSION_CATEGORIES_MAX_LIMIT);
    const rows = await this.sqlDb
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        downloadEnabled: categoryDownloadPermissions.downloadEnabled,
        createdAt: categories.createdAt,
        updatedAt: categories.updatedAt,
      })
      .from(categories)
      .leftJoin(
        categoryDownloadPermissions,
        eq(categories.id, categoryDownloadPermissions.categoryId),
      )
      .orderBy(asc(categories.name), asc(categories.id))
      .limit(effectiveLimit);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      downloadEnabled: row.downloadEnabled ?? false,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
}

export class InMemoryPermissionCategoriesRepository implements IPermissionCategoriesRepository {
  public readonly categories = new Map<string, PermissionCategory>();

  public async listPermissionCategories(
    limit: number = PERMISSION_CATEGORIES_DEFAULT_LIMIT,
  ): Promise<ReadonlyArray<PermissionCategory>> {
    const effectiveLimit = Math.min(Math.max(1, limit), PERMISSION_CATEGORIES_MAX_LIMIT);
    return Array.from(this.categories.values())
      .sort((left, right) => {
        const nameOrder = left.name.localeCompare(right.name);
        if (nameOrder !== 0) return nameOrder;
        return left.id.localeCompare(right.id);
      })
      .slice(0, effectiveLimit);
  }
}
