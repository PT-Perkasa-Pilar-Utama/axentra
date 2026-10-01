import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentFiles, documentSmartTags, documents, smartTags } from "@axentra/db";
import type { SearchDocument, SearchDocumentsQuery } from "@axentra/shared";

export type SearchQueryResult = {
  items: ReadonlyArray<SearchDocument>;
  total: number;
};

export type ISearchRepository = {
  searchDocuments(query: SearchDocumentsQuery): Promise<SearchQueryResult>;
};

export class DrizzleSearchRepository implements ISearchRepository {
  public constructor(private readonly db: PostgresJsDatabase) {}

  public async searchDocuments(query: SearchDocumentsQuery): Promise<SearchQueryResult> {
    const conditions = [isNull(documents.deletedAt)];

    if (query.categoryId) {
      conditions.push(eq(documents.categoryId, query.categoryId));
    }

    if (query.q && query.q.trim().length > 0) {
      const pattern = `%${query.q.trim()}%`;
      const matchPattern = or(
        ilike(documents.title, pattern),
        ilike(documentFiles.originalName, pattern),
      );
      if (matchPattern !== undefined) {
        conditions.push(matchPattern);
      }
    }

    const uniqueTags = query.tags
      ? Array.from(
          new Set(query.tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0)),
        )
      : [];

    if (uniqueTags.length > 0) {
      const matchingDocIdsQuery = this.db
        .select({ documentId: documentSmartTags.documentId })
        .from(documentSmartTags)
        .innerJoin(smartTags, eq(smartTags.id, documentSmartTags.tagId))
        .where(inArray(sql`lower(${smartTags.name})`, uniqueTags))
        .groupBy(documentSmartTags.documentId)
        .having(eq(sql`count(distinct lower(${smartTags.name}))`, uniqueTags.length));

      conditions.push(inArray(documents.id, matchingDocIdsQuery));
    }

    const combinedWhere = and(...conditions);

    const [counted] = await this.db
      .select({ total: count() })
      .from(documents)
      .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
      .where(combinedWhere);

    const total = Number(counted?.total ?? 0);

    const rows = await this.db
      .select({
        id: documents.id,
        filename: documentFiles.originalName,
        processingStatus: documents.processingStatus,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
      .where(combinedWhere)
      .orderBy(desc(documents.createdAt), desc(documents.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);

    return {
      items: rows.map((row) => ({
        id: row.id,
        filename: row.filename,
        processingStatus: row.processingStatus,
        createdAt: row.createdAt.toISOString(),
        snippet: null,
      })),
      total,
    };
  }
}

export class InMemorySearchRepository implements ISearchRepository {
  private readonly documents: Array<{
    doc: SearchDocument;
    categoryId?: string | undefined;
    tags: Set<string>;
  }> = [];

  public addDocument(
    doc: SearchDocument,
    options?: { categoryId?: string | undefined; tags?: ReadonlyArray<string> | undefined },
  ): void {
    const tagSet = new Set(
      (options?.tags ?? []).map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0),
    );
    this.documents.push({
      doc,
      categoryId: options?.categoryId,
      tags: tagSet,
    });
  }

  public async searchDocuments(query: SearchDocumentsQuery): Promise<SearchQueryResult> {
    const uniqueTags = query.tags
      ? Array.from(
          new Set(query.tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0)),
        )
      : [];

    let filtered = this.documents;

    if (query.categoryId) {
      filtered = filtered.filter((d) => d.categoryId === query.categoryId);
    }

    if (query.q && query.q.trim().length > 0) {
      const qLower = query.q.trim().toLowerCase();
      filtered = filtered.filter((d) => d.doc.filename.toLowerCase().includes(qLower));
    }

    if (uniqueTags.length > 0) {
      filtered = filtered.filter((d) => uniqueTags.every((t) => d.tags.has(t)));
    }

    const start = (query.page - 1) * query.limit;
    const pageItems = filtered.slice(start, start + query.limit).map((d) => d.doc);

    return {
      items: pageItems,
      total: filtered.length,
    };
  }
}
