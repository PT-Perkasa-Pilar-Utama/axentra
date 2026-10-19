import { eq, inArray } from "drizzle-orm";
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
  findDownloadTargets: (
    documentIds: ReadonlyArray<string>,
  ) => Promise<ReadonlyArray<DownloadTargetRecord>>;
  recordDownloadAuditEvent: (event: CreateDownloadAuditEventInput) => Promise<void>;
  recordDownloadAuditEvents: (
    events: ReadonlyArray<CreateDownloadAuditEventInput>,
  ) => Promise<void>;
};

type DownloadTargetRow = {
  docId: string;
  docTitle: string;
  docCategoryId: string | null;
  docProcessingStatus: string;
  docDeletedAt: Date | null;
  fileId: string | null;
  fileStorageKey: string | null;
  fileOriginalName: string | null;
  fileMimeType: string | null;
  fileSize: string | number | null;
  fileExtension: string | null;
  permDownloadEnabled?: boolean | null | undefined;
};

function mapRowToDownloadTarget(row: DownloadTargetRow): DownloadTargetRecord {
  const file =
    row.fileId !== null &&
    row.fileStorageKey !== null &&
    row.fileOriginalName !== null &&
    row.fileMimeType !== null &&
    row.fileSize !== null &&
    row.fileExtension !== null
      ? {
          id: row.fileId,
          storageKey: row.fileStorageKey,
          originalName: row.fileOriginalName,
          mimeType: row.fileMimeType,
          fileSize: Number(row.fileSize),
          fileExtension: row.fileExtension,
        }
      : null;

  return {
    document: {
      id: row.docId,
      title: row.docTitle,
      categoryId: row.docCategoryId,
      processingStatus: row.docProcessingStatus,
      deletedAt: row.docDeletedAt,
    },
    file,
    categoryPermission:
      row.permDownloadEnabled !== null && row.permDownloadEnabled !== undefined
        ? {
            downloadEnabled: row.permDownloadEnabled,
          }
        : null,
  };
}

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
    return mapRowToDownloadTarget(first);
  }

  public async findDownloadTargets(
    documentIds: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<DownloadTargetRecord>> {
    if (documentIds.length === 0) return [];

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
      .where(inArray(documents.id, [...documentIds]));

    return rows.map(mapRowToDownloadTarget);
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

  public async recordDownloadAuditEvents(
    events: ReadonlyArray<CreateDownloadAuditEventInput>,
  ): Promise<void> {
    if (events.length === 0) return;
    await this.db.insert(downloadAuditEvents).values(
      events.map((event) => ({
        userId: event.userId ?? null,
        userName: event.userName ?? null,
        userEmail: event.userEmail ?? null,
        documentId: event.documentId ?? null,
        documentName: event.documentName,
        downloadedAt: event.downloadedAt ?? new Date(),
      })),
    );
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

  public async findDownloadTargets(
    documentIds: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<DownloadTargetRecord>> {
    const results: DownloadTargetRecord[] = [];
    for (const id of documentIds) {
      const target = this.targets.get(id);
      if (target) results.push(target);
    }
    return results;
  }

  public async recordDownloadAuditEvent(event: CreateDownloadAuditEventInput): Promise<void> {
    this.auditEvents.push({
      ...event,
      downloadedAt: event.downloadedAt ?? new Date(),
    });
  }

  public async recordDownloadAuditEvents(
    events: ReadonlyArray<CreateDownloadAuditEventInput>,
  ): Promise<void> {
    for (const event of events) {
      this.auditEvents.push({
        ...event,
        downloadedAt: event.downloadedAt ?? new Date(),
      });
    }
  }

  public getRecordedAuditEvents(): ReadonlyArray<CreateDownloadAuditEventInput> {
    return [...this.auditEvents];
  }
}
