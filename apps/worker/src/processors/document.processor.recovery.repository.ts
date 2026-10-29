import { and, eq, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentFiles, documents } from "@axentra/db";
import { PROCESSING_ENQUEUE_FAILURE_MESSAGE } from "@axentra/shared";
import type { RecoverableProcessingDocument } from "./document.processor.repository.types";

// Rows a recovery sweep may claim: 'processing' with no update since the stale clock, or failed by an
// enqueue outage. Both match only while the row is unchanged, so a concurrent worker cannot claim it twice.
function claimableCondition(staleProcessingBefore: Date): SQL | undefined {
  return or(
    and(
      eq(documents.processingStatus, "failed"),
      eq(documents.errorMessage, PROCESSING_ENQUEUE_FAILURE_MESSAGE),
    ),
    and(
      eq(documents.processingStatus, "processing"),
      lt(documents.updatedAt, staleProcessingBefore),
    ),
  );
}

export async function listRecoverableProcessingDocuments(
  db: PostgresJsDatabase,
  staleProcessingBefore: Date,
): Promise<ReadonlyArray<RecoverableProcessingDocument>> {
  return db
    .select({
      documentId: documents.id,
      storageKey: documentFiles.storageKey,
      processingStatus: documents.processingStatus,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      recoveryAttempts: documents.processingRecoveryAttempts,
    })
    .from(documents)
    .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
    .where(
      and(
        isNull(documents.deletedAt),
        or(eq(documents.processingStatus, "queued"), claimableCondition(staleProcessingBefore)),
      ),
    );
}

export async function recordRecoveryAttemptRow(
  db: PostgresJsDatabase,
  documentId: string,
  staleProcessingBefore: Date,
): Promise<boolean> {
  const claimed = await db
    .update(documents)
    .set({
      processingRecoveryAttempts: sql`${documents.processingRecoveryAttempts} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documents.id, documentId),
        isNull(documents.deletedAt),
        claimableCondition(staleProcessingBefore),
      ),
    )
    .returning({ id: documents.id });
  return claimed.length > 0;
}

export async function markRecoveryExhaustedRow(
  db: PostgresJsDatabase,
  documentId: string,
  errorMessage: string,
  staleProcessingBefore: Date,
): Promise<boolean> {
  const failed = await db
    .update(documents)
    .set({
      processingStatus: "failed",
      errorMessage,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documents.id, documentId),
        isNull(documents.deletedAt),
        claimableCondition(staleProcessingBefore),
      ),
    )
    .returning({ id: documents.id });
  return failed.length > 0;
}

export async function markEnqueueRecoveredRow(
  db: PostgresJsDatabase,
  documentId: string,
): Promise<void> {
  await db
    .update(documents)
    .set({
      processingStatus: "queued",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.processingStatus, "failed"),
        eq(documents.errorMessage, PROCESSING_ENQUEUE_FAILURE_MESSAGE),
      ),
    );
}
