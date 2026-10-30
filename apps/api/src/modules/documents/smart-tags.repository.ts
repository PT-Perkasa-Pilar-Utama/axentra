import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentSmartTags, documents, smartTags } from "@axentra/db";
import type { SmartTag } from "@axentra/shared";
import type { DocumentRecord } from "./metadata.repository";

export type IDocumentSmartTagsRepository = {
  findDocumentById: (documentId: string) => Promise<DocumentRecord | null>;
  findSmartTagsByDocumentId: (documentId: string) => Promise<ReadonlyArray<SmartTag>>;
  saveDocumentSmartTags: (
    documentId: string,
    tags: ReadonlyArray<string>,
  ) => Promise<ReadonlyArray<SmartTag>>;
};

export class DrizzleDocumentSmartTagsRepository implements IDocumentSmartTagsRepository {
  public constructor(private readonly db: PostgresJsDatabase) {}

  public async findDocumentById(documentId: string): Promise<DocumentRecord | null> {
    const rows = await this.db
      .select({
        id: documents.id,
        title: documents.title,
        processingStatus: documents.processingStatus,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  public async findSmartTagsByDocumentId(documentId: string): Promise<ReadonlyArray<SmartTag>> {
    const rows = await this.db
      .select({
        id: smartTags.id,
        name: smartTags.name,
        createdAt: smartTags.createdAt,
      })
      .from(documentSmartTags)
      .innerJoin(smartTags, eq(smartTags.id, documentSmartTags.tagId))
      .where(eq(documentSmartTags.documentId, documentId))
      .orderBy(asc(documentSmartTags.createdAt), asc(smartTags.name))
      .limit(3);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  public async saveDocumentSmartTags(
    documentId: string,
    tags: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<SmartTag>> {
    const now = new Date();
    const cappedTags = tags.slice(0, 3);
    if (cappedTags.length === 0) return [];

    return await this.db.transaction(async (tx) => {
      for (const tagName of cappedTags) {
        await tx
          .insert(smartTags)
          .values({ name: tagName })
          .onConflictDoNothing({ target: smartTags.name });
      }

      const tagRecords = await tx
        .select({
          id: smartTags.id,
          name: smartTags.name,
          createdAt: smartTags.createdAt,
        })
        .from(smartTags)
        .where(inArray(smartTags.name, [...cappedTags]));

      for (const record of tagRecords) {
        await tx
          .insert(documentSmartTags)
          .values({
            documentId,
            tagId: record.id,
            createdAt: now,
          })
          .onConflictDoNothing({
            target: [documentSmartTags.documentId, documentSmartTags.tagId],
          });
      }

      return tagRecords.map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.createdAt.toISOString(),
      }));
    });
  }
}

export class InMemoryDocumentSmartTagsRepository implements IDocumentSmartTagsRepository {
  private readonly documentsMap = new Map<string, DocumentRecord>();
  private readonly tagsMap = new Map<string, { id: string; name: string; createdAt: Date }>();
  private readonly documentTagsMap = new Map<string, string[]>();

  public addDocument(doc: DocumentRecord): void {
    this.documentsMap.set(doc.id, doc);
  }

  public addTag(tag: { id: string; name: string; createdAt?: Date | undefined }): void {
    this.tagsMap.set(tag.id, {
      id: tag.id,
      name: tag.name,
      createdAt: tag.createdAt ?? new Date(),
    });
  }

  public linkDocumentTag(documentId: string, tagId: string): void {
    const existing = this.documentTagsMap.get(documentId) ?? [];
    if (!existing.includes(tagId)) {
      this.documentTagsMap.set(documentId, [...existing, tagId]);
    }
  }

  public async findDocumentById(documentId: string): Promise<DocumentRecord | null> {
    return this.documentsMap.get(documentId) ?? null;
  }

  public async findSmartTagsByDocumentId(documentId: string): Promise<ReadonlyArray<SmartTag>> {
    const tagIds = this.documentTagsMap.get(documentId) ?? [];
    const results: SmartTag[] = [];

    for (const tagId of tagIds) {
      const tag = this.tagsMap.get(tagId);
      if (tag) {
        results.push({
          id: tag.id,
          name: tag.name,
          createdAt: tag.createdAt.toISOString(),
        });
      }
      if (results.length >= 3) break;
    }

    return results;
  }

  public async saveDocumentSmartTags(
    documentId: string,
    tags: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<SmartTag>> {
    const capped = tags.slice(0, 3);
    const results: SmartTag[] = [];

    for (const name of capped) {
      let existingTag: { id: string; name: string; createdAt: Date } | undefined;
      for (const t of this.tagsMap.values()) {
        if (t.name === name) {
          existingTag = t;
          break;
        }
      }

      if (!existingTag) {
        existingTag = {
          id: crypto.randomUUID(),
          name,
          createdAt: new Date(),
        };
        this.tagsMap.set(existingTag.id, existingTag);
      }

      this.linkDocumentTag(documentId, existingTag.id);
      results.push({
        id: existingTag.id,
        name: existingTag.name,
        createdAt: existingTag.createdAt.toISOString(),
      });
    }

    return results;
  }
}
