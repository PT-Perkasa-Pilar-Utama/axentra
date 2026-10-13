import { eq, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { categories, categoryDownloadPermissions } from "@axentra/db";

export type CategoryPersistenceInput = {
  name: string;
  slug: string;
};

export type CategoryPersistenceResult = {
  categoryId: string;
  isNew: boolean;
};

export type DatabaseTransaction = Parameters<Parameters<PostgresJsDatabase["transaction"]>[0]>[0];

/**
 * Lists all existing categories available in the database.
 */
export async function listAvailableCategories(
  db: PostgresJsDatabase,
): Promise<ReadonlyArray<{ name: string; slug: string }>> {
  return db
    .select({
      name: categories.name,
      slug: categories.slug,
    })
    .from(categories);
}

/**
 * Ensures a category exists (by slug or name) within the active transaction,
 * creates an inactive download permission record for the category,
 * and returns the category ID and whether it was newly created.
 *
 * Runs strictly within the provided database transaction to preserve atomicity (Finding F27).
 */
export async function ensureCategoryWithPermission(
  tx: DatabaseTransaction,
  category: CategoryPersistenceInput,
  now: Date = new Date(),
): Promise<CategoryPersistenceResult | null> {
  const [existing] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(or(eq(categories.slug, category.slug), eq(categories.name, category.name)))
    .limit(1);

  let categoryId: string | null = null;
  let isNew = false;

  if (existing) {
    categoryId = existing.id;
  } else {
    const [inserted] = await tx
      .insert(categories)
      .values({
        name: category.name,
        slug: category.slug,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: categories.id });

    if (inserted) {
      categoryId = inserted.id;
      isNew = true;
    } else {
      const [canonical] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(or(eq(categories.slug, category.slug), eq(categories.name, category.name)))
        .limit(1);
      if (canonical) {
        categoryId = canonical.id;
      }
    }
  }

  if (!categoryId) {
    return null;
  }

  await tx
    .insert(categoryDownloadPermissions)
    .values({
      categoryId,
      downloadEnabled: false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: categoryDownloadPermissions.categoryId,
    });

  return { categoryId, isNew };
}
