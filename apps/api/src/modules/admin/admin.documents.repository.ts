import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  adminDocumentAuditEvents,
  categories,
  documentFiles,
  documentMetadata,
  documents,
  users,
} from "@axentra/db";
import {
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_DEFAULT_PAGE,
  ADMIN_LIST_MAX_LIMIT,
  ADMIN_LIST_MAX_PAGE,
  type AdminDocumentDetail,
  type AdminDocumentListItem,
  type AdminDocumentsListQuery,
} from "@axentra/shared";

export type AdminDocumentAction = "archive" | "unarchive" | "delete";

export type AdminManagedDocumentRow = {
  id: string;
  title: string;
  archivedAt: Date | null;
  deletedAt: Date | null;
};

export type AdminDocumentAuditRecord = {
  documentId: string;
  documentTitle: string;
  action: AdminDocumentAction;
  previousArchivedAt: Date | null;
  newArchivedAt: Date | null;
  previousDeletedAt: Date | null;
  newDeletedAt: Date | null;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string;
  changedAt: Date;
};

export type AdminDocumentsPage = {
  items: ReadonlyArray<AdminDocumentListItem>;
  total: number;
};

export type IAdminDocumentRepository = {
  listDocuments: (query: AdminDocumentsListQuery) => Promise<AdminDocumentsPage>;
  findDocumentDetailById: (documentId: string) => Promise<AdminDocumentDetail | null>;
  // Runs the mutation and its audit write in one transaction. Services own the boundary; repositories own the queries.
  runInTransaction: <T>(work: (tx: IAdminDocumentRepository) => Promise<T>) => Promise<T>;
  findStoredDocumentForUpdate: (documentId: string) => Promise<AdminManagedDocumentRow | null>;
  setArchivedAt: (documentId: string, archivedAt: Date | null, updatedAt: Date) => Promise<void>;
  setDeletedAt: (documentId: string, deletedAt: Date, updatedAt: Date) => Promise<void>;
  insertDocumentAudit: (record: AdminDocumentAuditRecord) => Promise<void>;
};

export type DrizzleAdminDocumentClient =
  | PostgresJsDatabase
  | Parameters<Parameters<PostgresJsDatabase["transaction"]>[0]>[0];

export class DrizzleAdminDocumentRepository implements IAdminDocumentRepository {
  public constructor(private readonly sqlDb: DrizzleAdminDocumentClient) {}

  public async listDocuments(
    query: AdminDocumentsListQuery = {
      page: ADMIN_LIST_DEFAULT_PAGE,
      limit: ADMIN_LIST_DEFAULT_LIMIT,
    },
  ): Promise<AdminDocumentsPage> {
    const effectivePage = Math.min(Math.max(1, query.page), ADMIN_LIST_MAX_PAGE);
    const effectiveLimit = Math.min(Math.max(1, query.limit), ADMIN_LIST_MAX_LIMIT);

    const [counted] = await this.sqlDb
      .select({ total: count() })
      .from(documents)
      .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
      .where(isNull(documents.deletedAt));

    const total = Number(counted?.total ?? 0);

    const rows = await this.sqlDb
      .select({
        id: documents.id,
        title: documents.title,
        ownerId: users.id,
        ownerName: users.name,
        uploadedAt: documents.createdAt,
        archivedAt: documents.archivedAt,
      })
      .from(documents)
      .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
      .leftJoin(users, eq(users.id, documents.uploadedBy))
      .where(isNull(documents.deletedAt))
      .orderBy(desc(documents.createdAt), desc(documents.id))
      .limit(effectiveLimit)
      .offset((effectivePage - 1) * effectiveLimit);

    return {
      items: rows.map((row) => {
        const ownerId = row.ownerId ?? null;
        return {
          id: row.id,
          title: row.title,
          ownerId,
          ownerName: ownerId ? (row.ownerName ?? null) : null,
          uploadedAt: row.uploadedAt.toISOString(),
          archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
        };
      }),
      total,
    };
  }

  public async findDocumentDetailById(documentId: string): Promise<AdminDocumentDetail | null> {
    const rows = await this.sqlDb
      .select({
        id: documents.id,
        title: documents.title,
        ownerId: users.id,
        ownerName: users.name,
        uploadedAt: documents.createdAt,
        archivedAt: documents.archivedAt,
        categoryId: categories.id,
        categoryName: categories.name,
        metadataId: documentMetadata.id,
        metadataAuthor: documentMetadata.author,
        metadataExtractedAt: documentMetadata.extractedAt,
      })
      .from(documents)
      .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
      .leftJoin(users, eq(users.id, documents.uploadedBy))
      .leftJoin(categories, eq(categories.id, documents.categoryId))
      .leftJoin(documentMetadata, eq(documentMetadata.documentId, documents.id))
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    const ownerId = row.ownerId ?? null;
    const categoryId = row.categoryId ?? null;

    return {
      id: row.id,
      title: row.title,
      ownerId,
      ownerName: ownerId ? (row.ownerName ?? null) : null,
      uploadedAt: row.uploadedAt.toISOString(),
      archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
      categoryId,
      categoryName: categoryId ? (row.categoryName ?? null) : null,
      metadata: row.metadataId
        ? {
            author: row.metadataAuthor ?? null,
            extractedAt: row.metadataExtractedAt ? row.metadataExtractedAt.toISOString() : null,
          }
        : null,
    };
  }

  public async runInTransaction<T>(work: (tx: IAdminDocumentRepository) => Promise<T>): Promise<T> {
    return this.sqlDb.transaction((tx) => work(new DrizzleAdminDocumentRepository(tx)));
  }

  public async findStoredDocumentForUpdate(
    documentId: string,
  ): Promise<AdminManagedDocumentRow | null> {
    const [row] = await this.sqlDb
      .select({
        id: documents.id,
        title: documents.title,
        archivedAt: documents.archivedAt,
        deletedAt: documents.deletedAt,
      })
      .from(documents)
      .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
      .limit(1)
      .for("update", { of: documents });
    return row ?? null;
  }

  public async setArchivedAt(
    documentId: string,
    archivedAt: Date | null,
    updatedAt: Date,
  ): Promise<void> {
    await this.sqlDb
      .update(documents)
      .set({ archivedAt, updatedAt })
      .where(eq(documents.id, documentId));
  }

  public async setDeletedAt(documentId: string, deletedAt: Date, updatedAt: Date): Promise<void> {
    await this.sqlDb
      .update(documents)
      .set({ deletedAt, updatedAt })
      .where(eq(documents.id, documentId));
  }

  public async insertDocumentAudit(record: AdminDocumentAuditRecord): Promise<void> {
    await this.sqlDb.insert(adminDocumentAuditEvents).values({
      documentId: record.documentId,
      documentTitle: record.documentTitle,
      action: record.action,
      previousArchivedAt: record.previousArchivedAt,
      newArchivedAt: record.newArchivedAt,
      previousDeletedAt: record.previousDeletedAt,
      newDeletedAt: record.newDeletedAt,
      actorUserId: record.actorUserId,
      actorName: record.actorName,
      actorEmail: record.actorEmail,
      changedAt: record.changedAt,
    });
  }
}

export {
  InMemoryAdminDocumentRepository,
  type InMemoryAdminCategoryRecord,
  type InMemoryAdminDocumentMetadataRecord,
  type InMemoryAdminDocumentOwnerRecord,
  type InMemoryAdminManagedDocumentRecord,
} from "./admin.documents.in-memory-repository";
