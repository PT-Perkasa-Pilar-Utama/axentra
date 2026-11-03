import { asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  categories,
  categoryDownloadPermissions,
  categoryPermissionAuditEvents,
} from "@axentra/db";
import {
  PERMISSION_CATEGORIES_DEFAULT_LIMIT,
  PERMISSION_CATEGORIES_MAX_LIMIT,
  type PermissionCategory,
} from "@axentra/shared";

export type UpdateCategoryPermissionActor = {
  readonly userId?: string | null | undefined;
  readonly userName?: string | null | undefined;
  readonly userEmail?: string | null | undefined;
};

export type CategoryPermissionAuditEventRecord = {
  categoryId: string;
  categoryName: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  previousDownloadEnabled: boolean | null;
  newDownloadEnabled: boolean;
  changedAt: string;
};

export type DrizzlePermissionCategoriesClient =
  | PostgresJsDatabase
  | Parameters<Parameters<PostgresJsDatabase["transaction"]>[0]>[0];

export type PermissionCategoryRow = {
  id: string;
  name: string;
  slug: string;
  downloadEnabled: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

export function resolvePermissionCategoriesLimit(
  limit: number = PERMISSION_CATEGORIES_DEFAULT_LIMIT,
): number {
  return Math.min(Math.max(1, limit), PERMISSION_CATEGORIES_MAX_LIMIT);
}

// A category without a permission row has never been activated, so it stays download-disabled.
export function toPermissionCategory(row: PermissionCategoryRow): PermissionCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    downloadEnabled: row.downloadEnabled ?? false,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type IPermissionCategoriesRepository = {
  listPermissionCategories: (limit?: number) => Promise<ReadonlyArray<PermissionCategory>>;
  updateCategoryDownloadPermission: (
    categoryId: string,
    downloadEnabled: boolean,
    actor?: UpdateCategoryPermissionActor,
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
      .limit(resolvePermissionCategoriesLimit(limit));

    return rows.map(toPermissionCategory);
  }

  public async updateCategoryDownloadPermission(
    categoryId: string,
    downloadEnabled: boolean,
    actor?: UpdateCategoryPermissionActor,
  ): Promise<PermissionCategory | null> {
    if (!this.inTransaction) {
      return await this.transaction((txRepo) =>
        txRepo.updateCategoryDownloadPermission(categoryId, downloadEnabled, actor),
      );
    }

    const [existingPermission] = await this.sqlDb
      .select({ downloadEnabled: categoryDownloadPermissions.downloadEnabled })
      .from(categoryDownloadPermissions)
      .where(eq(categoryDownloadPermissions.categoryId, categoryId))
      .limit(1);
    const previousDownloadEnabled = existingPermission?.downloadEnabled ?? null;

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

    await this.sqlDb.insert(categoryPermissionAuditEvents).values({
      categoryId,
      categoryName: categoryRow.name,
      userId: actor?.userId ?? null,
      userName: actor?.userName ?? null,
      userEmail: actor?.userEmail ?? null,
      previousDownloadEnabled,
      newDownloadEnabled: downloadEnabled,
      changedAt: now,
    });

    return toPermissionCategory({ ...categoryRow, downloadEnabled });
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
  public readonly auditEvents: CategoryPermissionAuditEventRecord[] = [];

  public async listPermissionCategories(
    limit: number = PERMISSION_CATEGORIES_DEFAULT_LIMIT,
  ): Promise<ReadonlyArray<PermissionCategory>> {
    return Array.from(this.categories.values())
      .sort((left, right) => {
        const nameOrder = left.name.localeCompare(right.name);
        if (nameOrder !== 0) return nameOrder;
        return left.id.localeCompare(right.id);
      })
      .slice(0, resolvePermissionCategoriesLimit(limit));
  }

  public async updateCategoryDownloadPermission(
    categoryId: string,
    downloadEnabled: boolean,
    actor?: UpdateCategoryPermissionActor,
  ): Promise<PermissionCategory | null> {
    const existing = this.categories.get(categoryId);
    if (!existing) {
      return null;
    }

    const previousDownloadEnabled = existing.downloadEnabled;
    const now = new Date().toISOString();
    const updated: PermissionCategory = {
      ...existing,
      downloadEnabled,
      updatedAt: now,
    };
    this.categories.set(categoryId, updated);
    this.auditEvents.push({
      categoryId,
      categoryName: existing.name,
      userId: actor?.userId ?? null,
      userName: actor?.userName ?? null,
      userEmail: actor?.userEmail ?? null,
      previousDownloadEnabled,
      newDownloadEnabled: downloadEnabled,
      changedAt: now,
    });
    return updated;
  }

  public async transaction<T>(
    callback: (txRepo: IPermissionCategoriesRepository) => Promise<T>,
  ): Promise<T> {
    const snapshotCategories = new Map(this.categories);
    const snapshotAuditLength = this.auditEvents.length;
    try {
      return await callback(this);
    } catch (error: unknown) {
      this.categories.clear();
      for (const [key, value] of snapshotCategories.entries()) {
        this.categories.set(key, value);
      }
      this.auditEvents.length = snapshotAuditLength;
      throw error;
    }
  }
}
