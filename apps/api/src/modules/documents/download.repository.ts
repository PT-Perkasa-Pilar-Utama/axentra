import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  categoryDownloadPermissions,
  documentFiles,
  documents,
  downloadAuditEvents,
} from "@axentra/db";

export type DownloadTargetRecord = {
  document: {
    id: string;
    title: string;
    categoryId: string | null;
    processingStatus: string;
    deletedAt: Date | null;
  };
  file: {
    id: string;
    storageKey: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    fileExtension: string;
  } | null;
  categoryPermission: {
    downloadEnabled: boolean;
  } | null;
};

export type CreateDownloadAuditEventInput = {
  userId?: string | null | undefined;
  userName?: string | null | undefined;
  userEmail?: string | null | undefined;
  documentId?: string | null | undefined;
  documentName: string;
  downloadedAt?: Date | undefined;
};

export type IDownloadRepository = {
  findDownloadTarget: (documentId: string) => Promise<DownloadTargetRecord | null>;
  recordDownloadAuditEvent: (event: CreateDownloadAuditEventInput) => Promise<void>;
};

export class DrizzleDownloadRepository implements IDownloadRepository {
  public constructor(private readonly db: PostgresJsDatabase) {}

  public async findDownloadTarget(documentId: string): Promise<DownloadTargetRecord | null> {
    const rows = await this.db
      .select({
        docId: documents.id,
        docTitle: documents.title,
        docCategoryId: documents.categoryId,
        docProcessingStatus: documents.processingStatus,
        docDeletedAt: documents.deletedAt,
        fileId: documentFiles.id,
        fileStorageKey: documentFiles.storageKey,
        fileOriginalName: documentFiles.originalName,
        fileMimeType: documentFiles.mimeType,
        fileSize: documentFiles.fileSize,
        fileExtension: documentFiles.fileExtension,
        permDownloadEnabled: categoryDownloadPermissions.downloadEnabled,
      })
      .from(documents)
      .leftJoin(documentFiles, eq(documentFiles.documentId, documents.id))
      .leftJoin(
        categoryDownloadPermissions,
        eq(categoryDownloadPermissions.categoryId, documents.categoryId),
      )
      .where(eq(documents.id, documentId))
      .limit(1);

    const first = rows[0];
    if (!first) return null;

    const file =
      first.fileId !== null &&
      first.fileStorageKey !== null &&
      first.fileOriginalName !== null &&
      first.fileMimeType !== null &&
      first.fileSize !== null &&
      first.fileExtension !== null
        ? {
            id: first.fileId,
            storageKey: first.fileStorageKey,
            originalName: first.fileOriginalName,
            mimeType: first.fileMimeType,
            fileSize: Number(first.fileSize),
            fileExtension: first.fileExtension,
          }
        : null;

    return {
      document: {
        id: first.docId,
        title: first.docTitle,
        categoryId: first.docCategoryId,
        processingStatus: first.docProcessingStatus,
        deletedAt: first.docDeletedAt,
      },
      file,
      categoryPermission:
        first.permDownloadEnabled !== null && first.permDownloadEnabled !== undefined
          ? {
              downloadEnabled: first.permDownloadEnabled,
            }
          : null,
    };
  }

  public async recordDownloadAuditEvent(event: CreateDownloadAuditEventInput): Promise<void> {
    await this.db.insert(downloadAuditEvents).values({
      userId: event.userId ?? null,
      userName: event.userName ?? null,
      userEmail: event.userEmail ?? null,
      documentId: event.documentId ?? null,
      documentName: event.documentName,
      downloadedAt: event.downloadedAt ?? new Date(),
    });
  }
}

export class InMemoryDownloadRepository implements IDownloadRepository {
  private readonly targets = new Map<string, DownloadTargetRecord>();
  private readonly auditEvents: CreateDownloadAuditEventInput[] = [];

  public setTarget(documentId: string, record: DownloadTargetRecord): void {
    this.targets.set(documentId, record);
  }

  public async findDownloadTarget(documentId: string): Promise<DownloadTargetRecord | null> {
    return this.targets.get(documentId) ?? null;
  }

  public async recordDownloadAuditEvent(event: CreateDownloadAuditEventInput): Promise<void> {
    this.auditEvents.push({
      ...event,
      downloadedAt: event.downloadedAt ?? new Date(),
    });
  }

  public getRecordedAuditEvents(): ReadonlyArray<CreateDownloadAuditEventInput> {
    return [...this.auditEvents];
  }
}
