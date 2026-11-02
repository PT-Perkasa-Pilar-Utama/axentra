import { asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { categories, categoryDownloadPermissions } from "@axentra/db";
import {
  PERMISSION_CATEGORIES_DEFAULT_LIMIT,
  PERMISSION_CATEGORIES_MAX_LIMIT,
  type PermissionCategory,
} from "@axentra/shared";

export type DrizzlePermissionCategoriesClient =
  | PostgresJsDatabase
  | Parameters<Parameters<PostgresJsDatabase["transaction"]>[0]>[0];

export type IPermissionCategoriesRepository = {
  listPermissionCategories: (limit?: number) => Promise<ReadonlyArray<PermissionCategory>>;
  updateCategoryDownloadPermission: (
    categoryId: string,
    downloadEnabled: boolean,
  ) => Promise<PermissionCategory | null>;
  transaction?: <T>(
    callback: (txRepo: IPermissionCategoriesRepository) => Promise<T>,
  ) => Promise<T>;
};

export class DrizzlePermissionCategoriesRepository implements IPermissionCategoriesRepository {
  public constructor(
    private readonly sqlDb: DrizzlePermissionCategoriesClient,
    private readonly inTransaction: boolean = false,
  ) {}

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

  public async updateCategoryDownloadPermission(
    categoryId: string,
    downloadEnabled: boolean,
  ): Promise<PermissionCategory | null> {
    if (!this.inTransaction) {
      return await this.transaction((txRepo) =>
        txRepo.updateCategoryDownloadPermission(categoryId, downloadEnabled),
      );
    }

    const now = new Date();
    const [categoryRow] = await this.sqlDb
      .update(categories)
      .set({ updatedAt: now })
      .where(eq(categories.id, categoryId))
      .returning({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        createdAt: categories.createdAt,
        updatedAt: categories.updatedAt,
      });

    if (!categoryRow) {
      return null;
    }

    await this.sqlDb
      .insert(categoryDownloadPermissions)
      .values({
        categoryId,
        downloadEnabled,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: categoryDownloadPermissions.categoryId,
        set: {
          downloadEnabled,
          updatedAt: now,
        },
      });

    return {
      id: categoryRow.id,
      name: categoryRow.name,
      slug: categoryRow.slug,
      downloadEnabled,
      createdAt: categoryRow.createdAt.toISOString(),
      updatedAt: categoryRow.updatedAt.toISOString(),
    };
  }

  public async transaction<T>(
    callback: (txRepo: IPermissionCategoriesRepository) => Promise<T>,
  ): Promise<T> {
    return await this.sqlDb.transaction(async (tx) => {
      const txRepo = new DrizzlePermissionCategoriesRepository(tx, true);
      return await callback(txRepo);
    });
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

  public async updateCategoryDownloadPermission(
    categoryId: string,
    downloadEnabled: boolean,
  ): Promise<PermissionCategory | null> {
    const existing = this.categories.get(categoryId);
    if (!existing) {
      return null;
    }

    const updated: PermissionCategory = {
      ...existing,
      downloadEnabled,
      updatedAt: new Date().toISOString(),
    };
    this.categories.set(categoryId, updated);
    return updated;
  }

  public async transaction<T>(
    callback: (txRepo: IPermissionCategoriesRepository) => Promise<T>,
  ): Promise<T> {
    const snapshot = new Map(this.categories);
    try {
      return await callback(this);
    } catch (error: unknown) {
      this.categories.clear();
      for (const [key, value] of snapshot.entries()) {
        this.categories.set(key, value);
      }
      throw error;
    }
  }
}
