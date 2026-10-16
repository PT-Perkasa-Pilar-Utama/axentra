import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentFiles, documents } from "@axentra/db";

export type PreviewTargetRecord = {
  document: {
    id: string;
    deletedAt: Date | null;
  };
  file: {
    id: string;
    storageKey: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
  } | null;
};

export type IPreviewRepository = {
  findPreviewTarget: (documentId: string) => Promise<PreviewTargetRecord | null>;
};

export class DrizzlePreviewRepository implements IPreviewRepository {
  public constructor(private readonly db: PostgresJsDatabase) {}

  public async findPreviewTarget(documentId: string): Promise<PreviewTargetRecord | null> {
    const rows = await this.db
      .select({
        docId: documents.id,
        docDeletedAt: documents.deletedAt,
        fileId: documentFiles.id,
        fileStorageKey: documentFiles.storageKey,
        fileOriginalName: documentFiles.originalName,
        fileMimeType: documentFiles.mimeType,
        fileSize: documentFiles.fileSize,
      })
      .from(documents)
      .leftJoin(documentFiles, eq(documentFiles.documentId, documents.id))
      .where(eq(documents.id, documentId))
      .limit(1);

    const first = rows[0];
    if (!first) return null;

    const file =
      first.fileId !== null &&
      first.fileStorageKey !== null &&
      first.fileOriginalName !== null &&
      first.fileMimeType !== null &&
      first.fileSize !== null
        ? {
            id: first.fileId,
            storageKey: first.fileStorageKey,
            originalName: first.fileOriginalName,
            mimeType: first.fileMimeType,
            fileSize: Number(first.fileSize),
          }
        : null;

    return {
      document: {
        id: first.docId,
        deletedAt: first.docDeletedAt,
      },
      file,
    };
  }
}

export class InMemoryPreviewRepository implements IPreviewRepository {
  private readonly targets = new Map<string, PreviewTargetRecord>();

  public setTarget(documentId: string, record: PreviewTargetRecord): void {
    this.targets.set(documentId, record);
  }

  public async findPreviewTarget(documentId: string): Promise<PreviewTargetRecord | null> {
    return this.targets.get(documentId) ?? null;
  }
}
