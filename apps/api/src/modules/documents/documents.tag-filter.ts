import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentFiles, documentSmartTags, documents, smartTags } from "@axentra/db";
import type { RecentDocumentPage } from "./documents.repository";

export async function listRecentDocumentsWithTagFilter(
  sqlDb: PostgresJsDatabase,
  page: number,
  limit: number,
  tags: ReadonlyArray<string>,
): Promise<RecentDocumentPage> {
  const normalizedTags = tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
  const uniqueTags = Array.from(new Set(normalizedTags));

  const whereActive = isNull(documents.deletedAt);

  if (uniqueTags.length === 0) {
    const [counted] = await sqlDb
      .select({ total: count() })
      .from(documents)
      .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
      .where(whereActive);
    const total = Number(counted?.total ?? 0);

    const rows = await sqlDb
      .select({
        id: documents.id,
        filename: documentFiles.originalName,
        processingStatus: documents.processingStatus,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
      .where(whereActive)
      .orderBy(desc(documents.createdAt), desc(documents.id))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      items: rows.map((row) => ({
        id: row.id,
        filename: row.filename,
        processingStatus: row.processingStatus,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: { page, limit, total },
    };
  }

  const matchingDocIdsQuery = sqlDb
    .select({ documentId: documentSmartTags.documentId })
    .from(documentSmartTags)
    .innerJoin(smartTags, eq(smartTags.id, documentSmartTags.tagId))
    .where(inArray(sql`lower(${smartTags.name})`, uniqueTags))
    .groupBy(documentSmartTags.documentId)
    .having(eq(sql`count(distinct lower(${smartTags.name}))`, uniqueTags.length));

  const whereFilter = and(whereActive, inArray(documents.id, matchingDocIdsQuery));

  const [counted] = await sqlDb
    .select({ total: count() })
    .from(documents)
    .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
    .where(whereFilter);

  const total = Number(counted?.total ?? 0);

  const rows = await sqlDb
    .select({
      id: documents.id,
      filename: documentFiles.originalName,
      processingStatus: documents.processingStatus,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
    .where(whereFilter)
    .orderBy(desc(documents.createdAt), desc(documents.id))
    .limit(limit)
    .offset((page - 1) * limit);

  return {
    items: rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      processingStatus: row.processingStatus,
      createdAt: row.createdAt.toISOString(),
    })),
    meta: { page, limit, total },
  };
}
