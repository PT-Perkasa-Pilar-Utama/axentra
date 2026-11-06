import { and, count, desc, eq, gte, isNull, max, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  categories,
  documentFiles,
  documentMetadata,
  documents,
  downloadAuditEvents,
  users,
} from "@axentra/db";
import {
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_DEFAULT_PAGE,
  ADMIN_LIST_MAX_LIMIT,
  ADMIN_LIST_MAX_PAGE,
  type AdminArchiveDocumentResult,
  type AdminDeleteDocumentResult,
  type AdminDocumentDetail,
  type AdminDocumentListItem,
  type AdminDocumentsListQuery,
  type AdminSummary,
  type AdminUnarchiveDocumentResult,
} from "@axentra/shared";

export type AdminDocumentsPage = {
  items: ReadonlyArray<AdminDocumentListItem>;
  total: number;
};

export type IAdminRepository = {
  getSummary: (uploadedSince: Date) => Promise<AdminSummary>;
  listDocuments: (query: AdminDocumentsListQuery) => Promise<AdminDocumentsPage>;
  findDocumentDetailById: (documentId: string) => Promise<AdminDocumentDetail | null>;
  archiveDocument: (documentId: string, now: Date) => Promise<AdminArchiveDocumentResult | null>;
  unarchiveDocument: (
    documentId: string,
    now: Date,
  ) => Promise<AdminUnarchiveDocumentResult | null>;
  softDeleteDocument: (documentId: string, now: Date) => Promise<AdminDeleteDocumentResult | null>;
};

function formatTimestamp(raw: unknown): string | null {
  if (raw instanceof Date) {
    return raw.toISOString();
  }
  // Defensive handling for string timestamp returns if provided by underlying driver.
  if (typeof raw === "string") {
    return new Date(raw).toISOString();
  }
  return null;
}

function activeStoredDocumentCondition(documentId: string) {
  return and(
    eq(documents.id, documentId),
    isNull(documents.deletedAt),
    sql`exists (select 1 from ${documentFiles} where ${eq(documentFiles.documentId, documents.id)})`,
  );
}

// Justification for class: implements IAdminRepository port to support dependency
// injection and in-memory test doubles, following DrizzleAnalyticsRepository precedent.
export class DrizzleAdminRepository implements IAdminRepository {
  public constructor(private readonly sqlDb: PostgresJsDatabase) {}

  public async getSummary(uploadedSince: Date): Promise<AdminSummary> {
    const [docsQuery, usersQuery, downloadsQuery] = await Promise.all([
      this.sqlDb
        .select({
          totalDocuments: count(),
          uploadedLast7Days: sql<number>`count(*) filter (where ${gte(documents.createdAt, uploadedSince)})`,
        })
        .from(documents)
        .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
        .where(isNull(documents.deletedAt)),

      this.sqlDb
        .select({
          memberTeamCount: sql<number>`count(*) filter (where ${eq(users.role, "member_team")})`,
          headOfTeamCount: sql<number>`count(*) filter (where ${eq(users.role, "head_of_team")})`,
          adminCount: sql<number>`count(*) filter (where ${eq(users.role, "admin")})`,
        })
        .from(users),

      this.sqlDb
        .select({
          downloadCount: count(),
          latestDownloadAt: max(downloadAuditEvents.downloadedAt),
        })
        .from(downloadAuditEvents),
    ]);

    const docsRow = docsQuery[0];
    const usersRow = usersQuery[0];
    const downloadsRow = downloadsQuery[0];

    const latestDownloadAt = formatTimestamp(downloadsRow?.latestDownloadAt);

    return {
      usersByRole: {
        member_team: Number(usersRow?.memberTeamCount ?? 0),
        head_of_team: Number(usersRow?.headOfTeamCount ?? 0),
        admin: Number(usersRow?.adminCount ?? 0),
      },
      totalDocuments: Number(docsRow?.totalDocuments ?? 0),
      uploadedLast7Days: Number(docsRow?.uploadedLast7Days ?? 0),
      downloadCount: Number(downloadsRow?.downloadCount ?? 0),
      latestDownloadAt,
    };
  }

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
          uploadedAt: formatTimestamp(row.uploadedAt) ?? new Date(0).toISOString(),
          archivedAt: formatTimestamp(row.archivedAt),
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
      uploadedAt: formatTimestamp(row.uploadedAt) ?? new Date(0).toISOString(),
      archivedAt: formatTimestamp(row.archivedAt),
      categoryId,
      categoryName: categoryId ? (row.categoryName ?? null) : null,
      metadata: row.metadataId
        ? {
            author: row.metadataAuthor ?? null,
            extractedAt: formatTimestamp(row.metadataExtractedAt),
          }
        : null,
    };
  }

  public async archiveDocument(
    documentId: string,
    now: Date,
  ): Promise<AdminArchiveDocumentResult | null> {
    const nowIso = now.toISOString();
    const [updated] = await this.sqlDb
      .update(documents)
      .set({
        archivedAt: sql`coalesce(${documents.archivedAt}, ${nowIso}::timestamptz)`,
        updatedAt: sql`case when ${documents.archivedAt} is null then ${nowIso}::timestamptz else ${documents.updatedAt} end`,
      })
      .where(activeStoredDocumentCondition(documentId))
      .returning({
        id: documents.id,
        archivedAt: documents.archivedAt,
      });

    const archivedAtIso = formatTimestamp(updated?.archivedAt);
    if (!updated || !archivedAtIso) {
      return null;
    }

    return {
      id: updated.id,
      archivedAt: archivedAtIso,
    };
  }

  public async unarchiveDocument(
    documentId: string,
    now: Date,
  ): Promise<AdminUnarchiveDocumentResult | null> {
    const nowIso = now.toISOString();
    const [updated] = await this.sqlDb
      .update(documents)
      .set({
        archivedAt: null,
        updatedAt: sql`case when ${documents.archivedAt} is not null then ${nowIso}::timestamptz else ${documents.updatedAt} end`,
      })
      .where(activeStoredDocumentCondition(documentId))
      .returning({
        id: documents.id,
      });

    if (!updated) {
      return null;
    }

    return {
      id: updated.id,
      archivedAt: null,
    };
  }

  public async softDeleteDocument(
    documentId: string,
    now: Date,
  ): Promise<AdminDeleteDocumentResult | null> {
    const [updated] = await this.sqlDb
      .update(documents)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(activeStoredDocumentCondition(documentId))
      .returning({
        id: documents.id,
        deletedAt: documents.deletedAt,
      });

    const deletedAtIso = formatTimestamp(updated?.deletedAt);
    if (!updated || !deletedAtIso) {
      return null;
    }

    return {
      id: updated.id,
      deletedAt: deletedAtIso,
    };
  }
}

export {
  InMemoryAdminRepository,
  type InMemoryAdminCategoryRecord,
  type InMemoryAdminDocumentMetadataRecord,
  type InMemoryAdminDocumentRecord,
  type InMemoryAdminDownloadRecord,
  type InMemoryAdminUserRecord,
} from "./admin.in-memory-repository";
