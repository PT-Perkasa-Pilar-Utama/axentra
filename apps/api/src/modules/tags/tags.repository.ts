import { and, asc, countDistinct, desc, eq, inArray, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentSmartTags, documents, smartTags } from "@axentra/db";
import type { TopTag, TopTagsQuery } from "@axentra/shared";

export type TopTagsRepository = {
  listTopTags: (query: TopTagsQuery) => Promise<ReadonlyArray<TopTag>>;
  listMostRecentDocumentTags: (query: TopTagsQuery) => Promise<ReadonlyArray<TopTag>>;
};

export class DrizzleTopTagsRepository implements TopTagsRepository {
  public constructor(private readonly db: PostgresJsDatabase) {}

  public async listTopTags(query: TopTagsQuery): Promise<ReadonlyArray<TopTag>> {
    const documentCount = countDistinct(documentSmartTags.documentId);
    const rows = await this.db
      .select({
        id: smartTags.id,
        name: smartTags.name,
        documentCount,
      })
      .from(smartTags)
      .innerJoin(documentSmartTags, eq(documentSmartTags.tagId, smartTags.id))
      .innerJoin(documents, eq(documents.id, documentSmartTags.documentId))
      .where(this.contextCondition(query))
      .groupBy(smartTags.id, smartTags.name)
      .orderBy(desc(documentCount), asc(smartTags.name))
      .limit(query.limit);

    return rows;
  }

  public async listMostRecentDocumentTags(query: TopTagsQuery): Promise<ReadonlyArray<TopTag>> {
    const latestTaggedDocument = await this.db
      .select({ documentId: documentSmartTags.documentId })
      .from(documentSmartTags)
      .innerJoin(documents, eq(documents.id, documentSmartTags.documentId))
      .where(this.contextCondition(query))
      .orderBy(desc(documentSmartTags.createdAt), desc(documentSmartTags.documentId))
      .limit(1);
    const documentId = latestTaggedDocument[0]?.documentId;

    if (documentId === undefined) return [];

    const latestDocumentTagLinks = await this.db
      .select({ tagId: documentSmartTags.tagId })
      .from(documentSmartTags)
      .where(eq(documentSmartTags.documentId, documentId));
    const latestTagIds = latestDocumentTagLinks.map((link) => link.tagId);

    if (latestTagIds.length === 0) return [];

    const documentCount = countDistinct(documentSmartTags.documentId);
    const rows = await this.db
      .select({
        id: smartTags.id,
        name: smartTags.name,
        documentCount,
      })
      .from(smartTags)
      .innerJoin(documentSmartTags, eq(documentSmartTags.tagId, smartTags.id))
      .innerJoin(documents, eq(documents.id, documentSmartTags.documentId))
      .where(and(this.contextCondition(query), inArray(smartTags.id, latestTagIds)))
      .groupBy(smartTags.id, smartTags.name)
      .orderBy(desc(documentCount), asc(smartTags.name))
      .limit(query.limit);

    return rows;
  }

  private contextCondition(query: TopTagsQuery) {
    const documentIdCondition =
      query.context === "search" && query.documentIds !== undefined
        ? inArray(documentSmartTags.documentId, query.documentIds)
        : undefined;

    return and(
      isNull(documents.deletedAt),
      eq(documents.processingStatus, "completed"),
      documentIdCondition,
    );
  }
}
