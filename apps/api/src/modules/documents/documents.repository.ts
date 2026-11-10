import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentContentHashes, documentFiles, documents } from "@axentra/db";
import type { RelatedDocument } from "@axentra/shared";
import { saveDocumentBatchInTransaction } from "./documents.batch-save";
import { listRelatedDocuments as listRelatedDocumentsQuery } from "./documents-related.repository";
import { listRecentDocumentsWithTagFilter } from "./documents.tag-filter";
import type {
  CreateDocumentBatchItem,
  DocumentBatchDb,
  IDocumentRepository,
  RecentDocumentPage,
  SavedDocumentRecord,
} from "./documents.repository.types";

export type {
  CreateDocumentBatchItem,
  DocumentBatchDb,
  DocumentBatchTx,
  IDocumentRepository,
  RecentDocumentPage,
  SavedDocumentRecord,
} from "./documents.repository.types";

export class DocumentRepository implements IDocumentRepository {
  public constructor(private readonly db: PostgresJsDatabase | DocumentBatchDb) {}

  private get sqlDb(): PostgresJsDatabase {
    if (!("select" in this.db)) throw new Error("Database query engine not configured");
    return this.db;
  }

  public async findExistingHashes(
    hashes: ReadonlyArray<string>,
    algorithm = "sha256",
  ): Promise<Set<string>> {
    if (hashes.length === 0) return new Set();

    const rows = await this.sqlDb
      .select({ contentHash: documentContentHashes.contentHash })
      .from(documentContentHashes)
      .innerJoin(documents, eq(documents.id, documentContentHashes.documentId))
      .where(
        and(
          inArray(documentContentHashes.contentHash, [...hashes]),
          eq(documentContentHashes.hashAlgorithm, algorithm),
          isNull(documents.deletedAt),
          isNull(documents.archivedAt),
        ),
      );

    return new Set(rows.map((r) => r.contentHash));
  }

  public async findByContentHash(
    contentHash: string,
    algorithm = "sha256",
  ): Promise<{ documentId: string; contentHash: string } | null> {
    const rows = await this.sqlDb
      .select({
        documentId: documentContentHashes.documentId,
        contentHash: documentContentHashes.contentHash,
      })
      .from(documentContentHashes)
      .innerJoin(documents, eq(documents.id, documentContentHashes.documentId))
      .where(
        and(
          eq(documentContentHashes.contentHash, contentHash),
          eq(documentContentHashes.hashAlgorithm, algorithm),
          isNull(documents.deletedAt),
          isNull(documents.archivedAt),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  public async listRecentDocuments(
    page: number,
    limit: number,
    tags?: ReadonlyArray<string> | undefined,
  ): Promise<RecentDocumentPage> {
    if (tags && tags.length > 0) {
      return listRecentDocumentsWithTagFilter(this.sqlDb, page, limit, tags);
    }
    const whereActive = and(isNull(documents.deletedAt), isNull(documents.archivedAt));
    const [counted] = await this.sqlDb
      .select({ total: count() })
      .from(documents)
      .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
      .where(whereActive);
    const total = Number(counted?.total ?? 0);
    const rows = await this.sqlDb
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

  public async listRelatedDocuments(
    documentId: string,
    limit: number,
  ): Promise<ReadonlyArray<RelatedDocument>> {
    return listRelatedDocumentsQuery(this.sqlDb, documentId, limit);
  }

  public async saveDocumentBatch(
    items: ReadonlyArray<CreateDocumentBatchItem>,
  ): Promise<ReadonlyArray<SavedDocumentRecord>> {
    return saveDocumentBatchInTransaction(this.db, items);
  }

  public async findDocumentById(id: string): Promise<typeof documents.$inferSelect | null> {
    const rows = await this.sqlDb.select().from(documents).where(eq(documents.id, id)).limit(1);
    return rows[0] ?? null;
  }

  public async findDocumentFileByDocumentId(
    documentId: string,
  ): Promise<typeof documentFiles.$inferSelect | null> {
    const rows = await this.sqlDb
      .select()
      .from(documentFiles)
      .where(eq(documentFiles.documentId, documentId))
      .limit(1);
    return rows[0] ?? null;
  }

  public async markProcessingEnqueueFailed(
    documentIds: ReadonlyArray<string>,
    errorMessage: string,
  ): Promise<void> {
    if (documentIds.length === 0) return;
    await this.sqlDb
      .update(documents)
      .set({
        processingStatus: "failed",
        errorMessage,
        updatedAt: new Date(),
      })
      .where(inArray(documents.id, [...documentIds]));
  }
}
