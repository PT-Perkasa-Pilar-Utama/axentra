import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentContentHashes, documentFiles, documents } from "@axentra/db";
import { DOCUMENT_COPY, DOCUMENT_ERROR_CODES } from "@axentra/shared";
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

export type SavedDocumentRecord = {
  documentId: string;
  title: string;
  originalName: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  fileExtension: string;
  contentHash: string;
};

export type IDocumentRepository = {
  findExistingHashes: (hashes: ReadonlyArray<string>, algorithm?: string) => Promise<Set<string>>;
  saveDocumentBatch: (
    items: ReadonlyArray<CreateDocumentBatchItem>,
  ) => Promise<ReadonlyArray<SavedDocumentRecord>>;
  findDocumentById: (id: string) => Promise<typeof documents.$inferSelect | null>;
  findDocumentFileByDocumentId: (
    documentId: string,
  ) => Promise<typeof documentFiles.$inferSelect | null>;
};

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as Record<string, unknown>;
  if (e.code === "23505") return true;
  if (
    typeof e.message === "string" &&
    (e.message.includes("document_content_hashes_hash_algo_unique_idx") ||
      e.message.includes("duplicate key value violates unique constraint") ||
      e.message.includes("UNIQUE constraint failed"))
  ) {
    return true;
  }
  if (e.cause !== null && typeof e.cause === "object") {
    return isUniqueConstraintError(e.cause);
  }
  return false;
}

export class DocumentRepository implements IDocumentRepository {
  public constructor(private readonly db: PostgresJsDatabase) {}

  public async findExistingHashes(
    hashes: ReadonlyArray<string>,
    algorithm = "sha256",
  ): Promise<Set<string>> {
    if (hashes.length === 0) {
      return new Set();
    }

    const rows = await this.db
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

  public async saveDocumentBatch(
    items: ReadonlyArray<CreateDocumentBatchItem>,
  ): Promise<ReadonlyArray<SavedDocumentRecord>> {
    if (items.length === 0) {
      return [];
    }

    try {
      return await this.db.transaction(async (tx) => {
        const saved: Array<SavedDocumentRecord> = [];

        for (const item of items) {
          await tx.insert(documents).values({
            id: item.id,
            title: item.title,
            processingStatus: "queued",
          });

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
    const rows = await this.db.select().from(documents).where(eq(documents.id, id)).limit(1);
    return rows[0] ?? null;
  }

  public async findDocumentFileByDocumentId(
    documentId: string,
  ): Promise<typeof documentFiles.$inferSelect | null> {
    const rows = await this.db
      .select()
      .from(documentFiles)
      .where(eq(documentFiles.documentId, documentId))
      .limit(1);
    return rows[0] ?? null;
  }
}
