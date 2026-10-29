import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentMetadata, documentSmartTags, documents, smartTags } from "@axentra/db";
import { type DatabaseTransaction, ensureCategoryWithPermission } from "./category.persistence";
import type { CompleteDocumentMetadataInput } from "./document.processor.repository.types";

const MAX_SMART_TAGS_PER_DOCUMENT = 3;

async function persistSmartTags(
  tx: DatabaseTransaction,
  documentId: string,
  tags: ReadonlyArray<string>,
  now: Date,
): Promise<void> {
  for (const tagName of tags.slice(0, MAX_SMART_TAGS_PER_DOCUMENT)) {
    await tx
      .insert(smartTags)
      .values({ name: tagName })
      .onConflictDoNothing({ target: smartTags.name });

    const [tagRecord] = await tx
      .select({ id: smartTags.id })
      .from(smartTags)
      .where(eq(smartTags.name, tagName))
      .limit(1);

    if (tagRecord) {
      await tx
        .insert(documentSmartTags)
        .values({ documentId, tagId: tagRecord.id, createdAt: now })
        .onConflictDoNothing({ target: [documentSmartTags.documentId, documentSmartTags.tagId] });
    }
  }
}

/**
 * Writes metadata, smart tags, and category, then marks the document completed, in one transaction.
 * Returns the ids of categories this call created.
 */
export async function completeDocumentWithMetadata(
  db: PostgresJsDatabase,
  documentId: string,
  metadata: CompleteDocumentMetadataInput,
  tags: ReadonlyArray<string> | undefined,
  category: { name: string; slug: string } | null | undefined,
): Promise<ReadonlyArray<string>> {
  const now = new Date();
  const createdCategoryIds: string[] = [];
  await db.transaction(async (tx) => {
    const metadataValues = {
      author: metadata.author,
      extractedText: metadata.extractedText ?? null,
      rawMetadata: metadata.rawMetadata,
      extractedAt: metadata.extractedAt,
    };
    await tx
      .insert(documentMetadata)
      .values({ documentId, ...metadataValues, updatedAt: now })
      .onConflictDoUpdate({
        target: documentMetadata.documentId,
        set: { ...metadataValues, updatedAt: now },
      });

    if (tags && tags.length > 0) {
      await persistSmartTags(tx, documentId, tags, now);
    }

    let categoryId: string | null = null;
    if (category) {
      const resolved = await ensureCategoryWithPermission(tx, category, now);
      if (resolved) {
        categoryId = resolved.categoryId;
        if (resolved.isNew) {
          createdCategoryIds.push(resolved.categoryId);
        }
      }
    }

    const updateValues: {
      processingStatus: "completed";
      errorMessage: null;
      updatedAt: Date;
      categoryId?: string;
    } = {
      processingStatus: "completed",
      errorMessage: null,
      updatedAt: now,
    };
    if (categoryId) {
      updateValues.categoryId = categoryId;
    }

    await tx.update(documents).set(updateValues).where(eq(documents.id, documentId));
  });
  return createdCategoryIds;
}
