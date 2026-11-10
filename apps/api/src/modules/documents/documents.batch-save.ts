import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentContentHashes, documentFiles, documents } from "@axentra/db";
import { DOCUMENT_COPY, DOCUMENT_ERROR_CODES } from "@axentra/shared";
import { ConflictError } from "../../http/errors";
import type {
  CreateDocumentBatchItem,
  DocumentBatchDb,
  DocumentBatchTx,
  SavedDocumentRecord,
} from "./documents.repository.types";

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

type BatchInsertTx =
  | Parameters<Parameters<PostgresJsDatabase["transaction"]>[0]>[0]
  | DocumentBatchTx;

async function insertBatchItemsInTx(
  tx: BatchInsertTx,
  items: ReadonlyArray<CreateDocumentBatchItem>,
): Promise<ReadonlyArray<SavedDocumentRecord>> {
  const saved: Array<SavedDocumentRecord> = [];

  for (const item of items) {
    await tx.insert(documents).values({
      id: item.id,
      title: item.title,
      processingStatus: "queued",
      uploadedBy: item.uploadedBy,
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
      uploadedBy: item.uploadedBy,
      originalName: item.originalName,
      storageKey: item.storageKey,
      mimeType: item.mimeType,
      fileSize: item.fileSize,
      fileExtension: item.fileExtension,
      contentHash: item.contentHash,
    });
  }

  return saved;
}

export async function saveDocumentBatchInTransaction(
  db: PostgresJsDatabase | DocumentBatchDb,
  items: ReadonlyArray<CreateDocumentBatchItem>,
): Promise<ReadonlyArray<SavedDocumentRecord>> {
  if (items.length === 0) {
    return [];
  }

  try {
    if ("select" in db) {
      return await db.transaction(async (tx) => {
        const hashes = items.map((item) => item.contentHash);
        const algorithm = items[0]?.hashAlgorithm ?? "sha256";
        const existingInTx = await tx
          .select({
            hashRowId: documentContentHashes.id,
            contentHash: documentContentHashes.contentHash,
            deletedAt: documents.deletedAt,
            archivedAt: documents.archivedAt,
          })
          .from(documentContentHashes)
          .innerJoin(documents, eq(documents.id, documentContentHashes.documentId))
          .where(
            and(
              inArray(documentContentHashes.contentHash, hashes),
              eq(documentContentHashes.hashAlgorithm, algorithm),
            ),
          )
          .for("update", { of: documents });

        const hasActiveDuplicate = existingInTx.some(
          (row) => row.deletedAt === null && row.archivedAt === null,
        );
        if (hasActiveDuplicate) {
          throw new ConflictError(
            DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT,
            DOCUMENT_COPY.DUPLICATE_WARNING,
          );
        }

        // Rebind content hashes previously held by archived or soft-deleted documents (F1).
        if (existingInTx.length > 0) {
          await tx.delete(documentContentHashes).where(
            inArray(
              documentContentHashes.id,
              existingInTx.map((row) => row.hashRowId),
            ),
          );
        }

        return insertBatchItemsInTx(tx, items);
      });
    }

    return await db.transaction(async (tx) => {
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

      return insertBatchItemsInTx(tx, items);
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
