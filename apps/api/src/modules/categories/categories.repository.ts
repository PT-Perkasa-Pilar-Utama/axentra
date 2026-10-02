import { asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { categories, categoryDownloadPermissions } from "@axentra/db";
import type { CategorySummary } from "@axentra/shared";

export type ICategoriesRepository = {
  listCategories: () => Promise<ReadonlyArray<CategorySummary>>;
};

export class DrizzleCategoriesRepository implements ICategoriesRepository {
  public constructor(private readonly sqlDb: PostgresJsDatabase) {}

  public async listCategories(): Promise<ReadonlyArray<CategorySummary>> {
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
      .orderBy(asc(categories.name));

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

export class InMemoryCategoriesRepository implements ICategoriesRepository {
  public readonly categories = new Map<string, CategorySummary>();

  public async listCategories(): Promise<ReadonlyArray<CategorySummary>> {
    return Array.from(this.categories.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
}
