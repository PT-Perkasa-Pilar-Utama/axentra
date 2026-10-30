import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

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

export type DocumentCategoryPermissionStatus = {
  documentId: string;
  categoryId: string | null;
  deletedAt: Date | null;
  downloadEnabled: boolean | null;
};

export type IDownloadRepository = {
  findDownloadTarget: (documentId: string) => Promise<DownloadTargetRecord | null>;
  findDownloadTargets: (
    documentIds: ReadonlyArray<string>,
  ) => Promise<ReadonlyArray<DownloadTargetRecord>>;
  checkCategoryPermissions: (
    documentIds: ReadonlyArray<string>,
    options?: { lock?: "share" | "update" } | undefined,
  ) => Promise<ReadonlyArray<DocumentCategoryPermissionStatus>>;
  recordDownloadAuditEvent: (event: CreateDownloadAuditEventInput) => Promise<void>;
  recordDownloadAuditEvents: (
    events: ReadonlyArray<CreateDownloadAuditEventInput>,
  ) => Promise<void>;
  transaction: <T>(callback: (txRepo: IDownloadRepository) => Promise<T>) => Promise<T>;
};

export type DownloadTargetRow = {
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

export function mapRowToDownloadTarget(row: DownloadTargetRow): DownloadTargetRecord {
  const file =
    row.fileId &&
    row.fileStorageKey &&
    row.fileOriginalName &&
    row.fileMimeType &&
    row.fileSize !== null &&
    row.fileExtension
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

export type DrizzleDownloadClient =
  | PostgresJsDatabase
  | Parameters<Parameters<PostgresJsDatabase["transaction"]>[0]>[0];
