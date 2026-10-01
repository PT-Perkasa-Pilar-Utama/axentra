import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { categories, categoryDownloadPermissions, documents } from "@axentra/db";
import type { CategorySummary } from "@axentra/shared";

export type DocumentCategoryTarget = {
  id: string;
  deletedAt?: Date | null | undefined;
};

export type IDocumentCategoryRepository = {
  findDocumentById: (id: string) => Promise<DocumentCategoryTarget | null>;
  findCategoryByDocumentId: (documentId: string) => Promise<CategorySummary | null>;
};

export class DrizzleDocumentCategoryRepository implements IDocumentCategoryRepository {
  public constructor(private readonly sqlDb: PostgresJsDatabase) {}

  public async findDocumentById(id: string): Promise<DocumentCategoryTarget | null> {
    const [row] = await this.sqlDb
      .select({ id: documents.id, deletedAt: documents.deletedAt })
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    return row ?? null;
  }

  public async findCategoryByDocumentId(documentId: string): Promise<CategorySummary | null> {
    const [row] = await this.sqlDb
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        downloadEnabled: categoryDownloadPermissions.downloadEnabled,
        createdAt: categories.createdAt,
        updatedAt: categories.updatedAt,
      })
      .from(documents)
      .innerJoin(categories, eq(documents.categoryId, categories.id))
      .leftJoin(
        categoryDownloadPermissions,
        eq(categories.id, categoryDownloadPermissions.categoryId),
      )
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      downloadEnabled: row.downloadEnabled ?? false,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class InMemoryDocumentCategoryRepository implements IDocumentCategoryRepository {
  public readonly documents = new Map<
    string,
    { id: string; categoryId?: string | null; deletedAt?: Date | null }
  >();
  public readonly categories = new Map<string, CategorySummary>();

  public async findDocumentById(id: string): Promise<DocumentCategoryTarget | null> {
    const doc = this.documents.get(id);
    if (!doc) return null;
    return { id: doc.id, deletedAt: doc.deletedAt };
  }

  public async findCategoryByDocumentId(documentId: string): Promise<CategorySummary | null> {
    const doc = this.documents.get(documentId);
    if (!doc || doc.deletedAt || !doc.categoryId) return null;
    return this.categories.get(doc.categoryId) ?? null;
  }
}
