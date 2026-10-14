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
 * Narrow dependency interface for category queries (Finding F28).
 */
export type CategoryQueryOperations = {
  listCategories(): Promise<ReadonlyArray<{ name: string; slug: string }>>;
};

/**
 * Narrow dependency interface for category persistence operations within a transaction (Finding F28).
 */
export type CategoryPersistenceOperations = {
  findCategoryBySlugOrName(slug: string, name: string): Promise<{ id: string } | null>;
  insertCategory(name: string, slug: string, now: Date): Promise<{ id: string } | null>;
  ensureCategoryPermission(categoryId: string, now: Date): Promise<void>;
};

/**
 * Creates query operations bound to a PostgreSQL database instance.
 */
export function createDatabaseCategoryQueries(db: PostgresJsDatabase): CategoryQueryOperations {
  return {
    async listCategories() {
      return db
        .select({
          name: categories.name,
          slug: categories.slug,
        })
        .from(categories);
    },
  };
}

/**
 * Creates category persistence operations bound to an active database transaction.
 */
export function createTransactionCategoryPersistence(
  tx: DatabaseTransaction,
): CategoryPersistenceOperations {
  return {
    async findCategoryBySlugOrName(slug: string, name: string) {
      const [existing] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(or(eq(categories.slug, slug), eq(categories.name, name)))
        .limit(1);
      return existing ?? null;
    },

    async insertCategory(name: string, slug: string, now: Date) {
      const [inserted] = await tx
        .insert(categories)
        .values({
          name,
          slug,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: categories.id });
      return inserted ?? null;
    },

    async ensureCategoryPermission(categoryId: string, now: Date) {
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
    },
  };
}

/**
 * Lists all existing categories available in the database.
 */
export async function listAvailableCategories(
  dbOrOps: PostgresJsDatabase | CategoryQueryOperations,
): Promise<ReadonlyArray<{ name: string; slug: string }>> {
  const ops = "listCategories" in dbOrOps ? dbOrOps : createDatabaseCategoryQueries(dbOrOps);
  return ops.listCategories();
}

/**
 * Ensures a category exists (by slug or name) within the active transaction,
 * creates an inactive download permission record for the category,
 * and returns the category ID and whether it was newly created.
 *
 * Runs strictly within the provided database transaction to preserve atomicity (Findings F27, F28).
 */
export async function ensureCategoryWithPermission(
  txOrOps: DatabaseTransaction | CategoryPersistenceOperations,
  category: CategoryPersistenceInput,
  now: Date = new Date(),
): Promise<CategoryPersistenceResult | null> {
  const ops: CategoryPersistenceOperations =
    "findCategoryBySlugOrName" in txOrOps ? txOrOps : createTransactionCategoryPersistence(txOrOps);

  const existing = await ops.findCategoryBySlugOrName(category.slug, category.name);
  let categoryId: string | null = null;
  let isNew = false;

  if (existing) {
    categoryId = existing.id;
  } else {
    const inserted = await ops.insertCategory(category.name, category.slug, now);
    if (inserted) {
      categoryId = inserted.id;
      isNew = true;
    } else {
      const canonical = await ops.findCategoryBySlugOrName(category.slug, category.name);
      if (canonical) {
        categoryId = canonical.id;
      }
    }
  }

  if (!categoryId) {
    return null;
  }

  await ops.ensureCategoryPermission(categoryId, now);

  return { categoryId, isNew };
}
