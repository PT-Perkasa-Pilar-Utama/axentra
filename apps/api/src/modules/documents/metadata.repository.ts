import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentMetadata, documents } from "@axentra/db";

export type DocumentRecord = {
  id: string;
  title: string;
  processingStatus: string;
  createdAt: Date;
  updatedAt: Date;
};

export type DocumentMetadataRecord = {
  id: string;
  documentId: string;
  author: string | null;
  rawMetadata: Record<string, unknown> | null;
  extractedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SaveMetadataInput = {
  documentId: string;
  author: string | null;
  rawMetadata?: Record<string, unknown> | null | undefined;
  extractedAt?: Date | null | undefined;
};

export type IDocumentMetadataRepository = {
  findDocumentById: (documentId: string) => Promise<DocumentRecord | null>;
  findMetadataByDocumentId: (documentId: string) => Promise<DocumentMetadataRecord | null>;
  saveMetadata: (data: SaveMetadataInput) => Promise<DocumentMetadataRecord>;
};

export class DrizzleDocumentMetadataRepository implements IDocumentMetadataRepository {
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
      .where(eq(documents.id, documentId))
      .limit(1);

    return rows[0] ?? null;
  }

  public async findMetadataByDocumentId(
    documentId: string,
  ): Promise<DocumentMetadataRecord | null> {
    const rows = await this.db
      .select({
        id: documentMetadata.id,
        documentId: documentMetadata.documentId,
        author: documentMetadata.author,
        rawMetadata: documentMetadata.rawMetadata,
        extractedAt: documentMetadata.extractedAt,
        createdAt: documentMetadata.createdAt,
        updatedAt: documentMetadata.updatedAt,
      })
      .from(documentMetadata)
      .where(eq(documentMetadata.documentId, documentId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      documentId: row.documentId,
      author: row.author,
      rawMetadata: (row.rawMetadata as Record<string, unknown>) ?? null,
      extractedAt: row.extractedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public async saveMetadata(data: SaveMetadataInput): Promise<DocumentMetadataRecord> {
    const now = new Date();
    const [saved] = await this.db
      .insert(documentMetadata)
      .values({
        documentId: data.documentId,
        author: data.author,
        rawMetadata: data.rawMetadata ?? null,
        extractedAt: data.extractedAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: documentMetadata.documentId,
        set: {
          author: data.author,
          rawMetadata: data.rawMetadata ?? null,
          extractedAt: data.extractedAt ?? now,
          updatedAt: now,
        },
      })
      .returning();

    if (!saved) {
      throw new Error("Gagal menyimpan metadata dokumen");
    }

    return {
      id: saved.id,
      documentId: saved.documentId,
      author: saved.author,
      rawMetadata: (saved.rawMetadata as Record<string, unknown>) ?? null,
      extractedAt: saved.extractedAt,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }
}

/**
 * In-memory repository implementation for hermetic unit testing without database dependency.
 */
export class InMemoryDocumentMetadataRepository implements IDocumentMetadataRepository {
  private readonly documentsMap = new Map<string, DocumentRecord>();
  private readonly metadataMap = new Map<string, DocumentMetadataRecord>();

  public addDocument(doc: DocumentRecord): void {
    this.documentsMap.set(doc.id, doc);
  }

  public async findDocumentById(documentId: string): Promise<DocumentRecord | null> {
    return this.documentsMap.get(documentId) ?? null;
  }

  public async findMetadataByDocumentId(
    documentId: string,
  ): Promise<DocumentMetadataRecord | null> {
    for (const meta of this.metadataMap.values()) {
      if (meta.documentId === documentId) {
        return meta;
      }
    }
    return null;
  }

  public async saveMetadata(data: SaveMetadataInput): Promise<DocumentMetadataRecord> {
    const existing = await this.findMetadataByDocumentId(data.documentId);
    const now = new Date();

    if (existing) {
      const updated: DocumentMetadataRecord = {
        ...existing,
        author: data.author,
        rawMetadata: data.rawMetadata ?? null,
        extractedAt: data.extractedAt ?? now,
        updatedAt: now,
      };
      this.metadataMap.set(existing.id, updated);
      return updated;
    }

    const id = crypto.randomUUID();
    const created: DocumentMetadataRecord = {
      id,
      documentId: data.documentId,
      author: data.author,
      rawMetadata: data.rawMetadata ?? null,
      extractedAt: data.extractedAt ?? now,
      createdAt: now,
      updatedAt: now,
    };
    this.metadataMap.set(id, created);
    return created;
  }
}
