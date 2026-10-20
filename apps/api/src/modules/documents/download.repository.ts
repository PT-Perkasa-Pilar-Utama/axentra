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

/**
 * Reads and writes for one download decision. Both methods run in the same transaction, so an audit
 * row commits only when the document and permission state still allow the download at commit time.
 */
export type DownloadWriteScope = {
  lockDownloadTarget: (documentId: string) => Promise<DownloadTargetRecord | null>;
  recordDownloadAuditEvent: (event: CreateDownloadAuditEventInput) => Promise<void>;
};

export type IDownloadRepository = {
  findDownloadTarget: (documentId: string) => Promise<DownloadTargetRecord | null>;
  runInDownloadTransaction: <T>(work: (scope: DownloadWriteScope) => Promise<T>) => Promise<T>;
};

// Matches both the root database handle and a transaction handle from the same client.
type DownloadQueryExecutor = Pick<PostgresJsDatabase, "select" | "insert">;

async function loadCategoryPermission(
  executor: DownloadQueryExecutor,
  categoryId: string,
  lock: boolean,
): Promise<{ downloadEnabled: boolean } | null> {
  const query = executor
    .select({ downloadEnabled: categoryDownloadPermissions.downloadEnabled })
    .from(categoryDownloadPermissions)
    .where(eq(categoryDownloadPermissions.categoryId, categoryId))
    .limit(1);
  const [row] = lock ? await query.for("share") : await query;
  return row ? { downloadEnabled: row.downloadEnabled } : null;
}

async function loadDownloadTarget(
  executor: DownloadQueryExecutor,
  documentId: string,
  lock: boolean,
): Promise<DownloadTargetRecord | null> {
  const documentQuery = executor
    .select({
      id: documents.id,
      title: documents.title,
      categoryId: documents.categoryId,
      processingStatus: documents.processingStatus,
      deletedAt: documents.deletedAt,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  const [documentRow] = lock ? await documentQuery.for("share") : await documentQuery;
  if (!documentRow) return null;

  const [fileRow] = await executor
    .select({
      id: documentFiles.id,
      storageKey: documentFiles.storageKey,
      originalName: documentFiles.originalName,
      mimeType: documentFiles.mimeType,
      fileSize: documentFiles.fileSize,
      fileExtension: documentFiles.fileExtension,
    })
    .from(documentFiles)
    .where(eq(documentFiles.documentId, documentId))
    .limit(1);

  const categoryPermission =
    documentRow.categoryId === null
      ? null
      : await loadCategoryPermission(executor, documentRow.categoryId, lock);

  return {
    document: {
      id: documentRow.id,
      title: documentRow.title,
      categoryId: documentRow.categoryId,
      processingStatus: documentRow.processingStatus,
      deletedAt: documentRow.deletedAt,
    },
    file: fileRow
      ? {
          id: fileRow.id,
          storageKey: fileRow.storageKey,
          originalName: fileRow.originalName,
          mimeType: fileRow.mimeType,
          fileSize: fileRow.fileSize,
          fileExtension: fileRow.fileExtension,
        }
      : null,
    categoryPermission,
  };
}

async function insertDownloadAuditEvent(
  executor: DownloadQueryExecutor,
  event: CreateDownloadAuditEventInput,
): Promise<void> {
  await executor.insert(downloadAuditEvents).values({
    userId: event.userId ?? null,
    userName: event.userName ?? null,
    userEmail: event.userEmail ?? null,
    documentId: event.documentId ?? null,
    documentName: event.documentName,
    downloadedAt: event.downloadedAt ?? new Date(),
  });
}

export class DrizzleDownloadRepository implements IDownloadRepository {
  public constructor(private readonly db: PostgresJsDatabase) {}

  public async findDownloadTarget(documentId: string): Promise<DownloadTargetRecord | null> {
    return await loadDownloadTarget(this.db, documentId, false);
  }

  public async runInDownloadTransaction<T>(
    work: (scope: DownloadWriteScope) => Promise<T>,
  ): Promise<T> {
    return await this.db.transaction(async (tx) => {
      return await work({
        lockDownloadTarget: async (documentId) => await loadDownloadTarget(tx, documentId, true),
        recordDownloadAuditEvent: async (event) => await insertDownloadAuditEvent(tx, event),
      });
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

  // Pending audit rows become visible only when the unit of work resolves, which mirrors a commit.
  public async runInDownloadTransaction<T>(
    work: (scope: DownloadWriteScope) => Promise<T>,
  ): Promise<T> {
    const pending: CreateDownloadAuditEventInput[] = [];
    const result = await work({
      lockDownloadTarget: async (documentId) => this.targets.get(documentId) ?? null,
      recordDownloadAuditEvent: async (event) => {
        pending.push({ ...event, downloadedAt: event.downloadedAt ?? new Date() });
      },
    });
    this.auditEvents.push(...pending);
    return result;
  }

  public getRecordedAuditEvents(): ReadonlyArray<CreateDownloadAuditEventInput> {
    return [...this.auditEvents];
  }
}
