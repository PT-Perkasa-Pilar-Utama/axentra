import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentContentHashes, documentFiles, documents } from "@axentra/db";
import {
  DOCUMENT_COPY,
  DOCUMENT_ERROR_CODES,
  type PaginationMeta,
  type RecentDocument,
} from "@axentra/shared";
import { ConflictError } from "../../http/errors";

export type CreateDocumentBatchItem = {
  id: string;
  title: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  fileExtension: string;
  contentHash: string;
  hashAlgorithm?: string;
};

export type SavedDocumentRecord = Omit<CreateDocumentBatchItem, "id" | "hashAlgorithm"> & {
  documentId: string;
};

export type RecentDocumentPage = {
  items: ReadonlyArray<RecentDocument>;
  meta: PaginationMeta;
};

export type IDocumentRepository = {
  findExistingHashes: (hashes: ReadonlyArray<string>, algorithm?: string) => Promise<Set<string>>;
  findByContentHash?: (
    contentHash: string,
    algorithm?: string,
  ) => Promise<{ documentId: string; contentHash: string } | null>;
  listRecentDocuments: (page: number, limit: number) => Promise<RecentDocumentPage>;
  saveDocumentBatch: (
    items: ReadonlyArray<CreateDocumentBatchItem>,
  ) => Promise<ReadonlyArray<SavedDocumentRecord>>;
  findDocumentById: (id: string) => Promise<typeof documents.$inferSelect | null>;
  findDocumentFileByDocumentId: (
    documentId: string,
  ) => Promise<typeof documentFiles.$inferSelect | null>;
  markProcessingEnqueueFailed: (
    documentIds: ReadonlyArray<string>,
    errorMessage: string,
  ) => Promise<void>;
};

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as Record<string, unknown>;
  if (e.code === "23505") return true;
  const msg = typeof e.message === "string" ? e.message : "";
  const matches =
    msg.includes("document_content_hashes_hash_algo_unique_idx") ||
    msg.includes("duplicate key value violates unique constraint") ||
    msg.includes("UNIQUE constraint failed");
  return (
    matches || (e.cause !== null && typeof e.cause === "object" && isUniqueConstraintError(e.cause))
  );
}

export type DocumentBatchTx = {
  select: (fields: unknown) => {
    from: (table: unknown) => {
      where: (condition: unknown) => Promise<ReadonlyArray<{ contentHash: string }>>;
    };
  };
  insert: (table: unknown) => { values: (values: unknown) => Promise<unknown> };
};

export type DocumentBatchDb = {
  transaction: <T>(callback: (tx: DocumentBatchTx) => Promise<T>) => Promise<T>;
};

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
      .where(
        and(
          inArray(documentContentHashes.contentHash, [...hashes]),
          eq(documentContentHashes.hashAlgorithm, algorithm),
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
      .where(
        and(
          eq(documentContentHashes.contentHash, contentHash),
          eq(documentContentHashes.hashAlgorithm, algorithm),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  public async listRecentDocuments(page: number, limit: number): Promise<RecentDocumentPage> {
    const whereActive = isNull(documents.deletedAt);
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

  public async saveDocumentBatch(
    items: ReadonlyArray<CreateDocumentBatchItem>,
  ): Promise<ReadonlyArray<SavedDocumentRecord>> {
    if (items.length === 0) {
      return [];
    }

    try {
      return await this.db.transaction(async (tx) => {
        const hashes = items.map((item) => item.contentHash);
        const algorithm = items[0]?.hashAlgorithm ?? "sha256";
        const existingInTx = await tx
          .select({ contentHash: documentContentHashes.contentHash })
          .from(documentContentHashes)
          .where(
            and(
              inArray(documentContentHashes.contentHash, hashes),
              eq(documentContentHashes.hashAlgorithm, algorithm),
            ),
          );

        if (existingInTx.length > 0) {
          throw new ConflictError(
            DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT,
            DOCUMENT_COPY.DUPLICATE_WARNING,
          );
        }

        const saved: Array<SavedDocumentRecord> = [];

        for (const item of items) {
          await tx
            .insert(documents)
            .values({ id: item.id, title: item.title, processingStatus: "queued" });
          await tx.insert(documentFiles).values({
            id: crypto.randomUUID(),
            documentId: item.id,
            storageKey: item.storageKey,
            originalName: item.originalName,
            mimeType: item.mimeType,
            fileSize: item.fileSize,
            fileExtension: item.fileExtension,
          });
          await tx.insert(documentContentHashes).values({
            id: crypto.randomUUID(),
            documentId: item.id,
            hashAlgorithm: item.hashAlgorithm ?? "sha256",
            contentHash: item.contentHash,
          });

          saved.push({
            documentId: item.id,
            title: item.title,
            originalName: item.originalName,
            storageKey: item.storageKey,
            mimeType: item.mimeType,
            fileSize: item.fileSize,
            fileExtension: item.fileExtension,
            contentHash: item.contentHash,
          });
        }

        return saved;
      });
    } catch (error: unknown) {
      if (error instanceof ConflictError) throw error;
      if (isUniqueConstraintError(error)) {
        throw new ConflictError(
          DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT,
          DOCUMENT_COPY.DUPLICATE_WARNING,
        );
      }
      throw error;
    }
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
    await this.db
      .update(documents)
      .set({
        processingStatus: "failed",
        errorMessage,
        updatedAt: new Date(),
      })
      .where(inArray(documents.id, [...documentIds]));
  }
}
