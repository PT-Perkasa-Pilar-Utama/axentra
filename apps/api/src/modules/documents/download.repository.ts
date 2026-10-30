import { eq, inArray } from "drizzle-orm";
import {
  categoryDownloadPermissions,
  documentFiles,
  documents,
  downloadAuditEvents,
} from "@axentra/db";
import {
  mapRowToDownloadTarget,
  type CreateDownloadAuditEventInput,
  type DocumentCategoryPermissionStatus,
  type DownloadTargetRecord,
  type DrizzleDownloadClient,
  type IDownloadRepository,
} from "./download.repository.types";

export type {
  CreateDownloadAuditEventInput,
  DocumentCategoryPermissionStatus,
  DownloadTargetRecord,
  DownloadTargetRow,
  DrizzleDownloadClient,
  IDownloadRepository,
} from "./download.repository.types";
export { mapRowToDownloadTarget } from "./download.repository.types";

export class DrizzleDownloadRepository implements IDownloadRepository {
  public constructor(private readonly db: DrizzleDownloadClient) {}

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
    await this.recordDownloadAuditEvents([event]);
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

  public async checkCategoryPermissions(
    documentIds: ReadonlyArray<string>,
    options?: { lock?: "share" | "update" } | undefined,
  ): Promise<ReadonlyArray<DocumentCategoryPermissionStatus>> {
    if (documentIds.length === 0) return [];

    const docQuery = this.db
      .select({
        id: documents.id,
        categoryId: documents.categoryId,
        deletedAt: documents.deletedAt,
      })
      .from(documents)
      .where(inArray(documents.id, [...documentIds]));

    const docRows = await (options?.lock ? docQuery.for(options.lock) : docQuery);
    if (docRows.length === 0) return [];

    const categoryIds = Array.from(
      new Set(docRows.map((d) => d.categoryId).filter((id): id is string => id !== null)),
    );

    let permMap = new Map<string, boolean>();
    if (categoryIds.length > 0) {
      const permQuery = this.db
        .select({
          categoryId: categoryDownloadPermissions.categoryId,
          downloadEnabled: categoryDownloadPermissions.downloadEnabled,
        })
        .from(categoryDownloadPermissions)
        .where(inArray(categoryDownloadPermissions.categoryId, categoryIds));

      const permRows = await (options?.lock ? permQuery.for(options.lock) : permQuery);
      permMap = new Map(permRows.map((p) => [p.categoryId, p.downloadEnabled]));
    }

    return docRows.map((doc) => ({
      documentId: doc.id,
      categoryId: doc.categoryId,
      deletedAt: doc.deletedAt,
      downloadEnabled: doc.categoryId ? (permMap.get(doc.categoryId) ?? null) : null,
    }));
  }

  public async transaction<T>(callback: (txRepo: IDownloadRepository) => Promise<T>): Promise<T> {
    return await this.db.transaction(async (tx) => {
      const txRepo = new DrizzleDownloadRepository(tx);
      return await callback(txRepo);
    });
  }
}

export { InMemoryDownloadRepository } from "./download.in-memory-repository";
