import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentFiles, documents } from "@axentra/db";

export type DocumentDetailRecord = {
  document: typeof documents.$inferSelect;
  file: typeof documentFiles.$inferSelect;
};

export type IDocumentDetailRepository = {
  findDocumentDetail: (id: string) => Promise<DocumentDetailRecord | null>;
};

// Active (not soft-deleted) document joined to its stored file. A document without a file record is absent.
export async function findDocumentDetailRecord(
  db: PostgresJsDatabase,
  documentId: string,
): Promise<DocumentDetailRecord | null> {
  const rows = await db
    .select({ document: documents, file: documentFiles })
    .from(documents)
    .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
    .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

// Drizzle-backed detail read. The service receives this repository directly; DocumentRepository does not
// proxy it.
export class DocumentDetailRepository implements IDocumentDetailRepository {
  public constructor(private readonly db: PostgresJsDatabase) {}

  public async findDocumentDetail(id: string): Promise<DocumentDetailRecord | null> {
    return findDocumentDetailRecord(this.db, id);
  }
}
