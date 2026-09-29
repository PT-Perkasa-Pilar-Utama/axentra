import { and, desc, eq, inArray, isNull, not, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentFiles, documentSmartTags, documents, smartTags } from "@axentra/db";
import { RELATED_DOCUMENTS_MAX_LIMIT, type RelatedDocument } from "@axentra/shared";

export async function listRelatedDocuments(
  sqlDb: PostgresJsDatabase,
  documentId: string,
  limit: number,
): Promise<ReadonlyArray<RelatedDocument>> {
  const sourceTags = await sqlDb
    .select({ tagId: documentSmartTags.tagId })
    .from(documentSmartTags)
    .where(eq(documentSmartTags.documentId, documentId));
  const sourceTagIds = sourceTags.map((row) => row.tagId);

  if (sourceTagIds.length === 0) return [];

  const rows = await sqlDb
    .select({
      id: documents.id,
      filename: documentFiles.originalName,
      processingStatus: documents.processingStatus,
      createdAt: documents.createdAt,
      sharedTags: sql<string[]>`array_agg(DISTINCT ${smartTags.name} ORDER BY ${smartTags.name})`,
    })
    .from(documentSmartTags)
    .innerJoin(smartTags, eq(smartTags.id, documentSmartTags.tagId))
    .innerJoin(documents, eq(documents.id, documentSmartTags.documentId))
    .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
    .where(
      and(
        inArray(documentSmartTags.tagId, sourceTagIds),
        not(eq(documents.id, documentId)),
        isNull(documents.deletedAt),
      ),
    )
    .groupBy(
      documents.id,
      documentFiles.originalName,
      documents.processingStatus,
      documents.createdAt,
    )
    .orderBy(desc(documents.createdAt), desc(documents.id))
    .limit(Math.min(limit, RELATED_DOCUMENTS_MAX_LIMIT));

  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    processingStatus: row.processingStatus,
    createdAt: row.createdAt.toISOString(),
    sharedTags: row.sharedTags,
  }));
}
