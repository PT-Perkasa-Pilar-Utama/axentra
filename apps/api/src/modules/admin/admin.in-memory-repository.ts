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
  type ProcessingStatus,
  type UserRole,
} from "@axentra/shared";
import type { AdminDocumentsPage, IAdminRepository } from "./admin.repository";

export type InMemoryAdminUserRecord = {
  id: string;
  role: UserRole;
  name?: string | undefined;
  email?: string | undefined;
  // Retained for test fixture parity; getSummary counts all users regardless of status per proposed default O10.
  status?: "active" | "inactive" | undefined;
};

export type InMemoryAdminCategoryRecord = {
  id: string;
  name: string;
};

export type InMemoryAdminDocumentMetadataRecord = {
  author: string | null;
  extractedAt: Date | null;
  rawMetadata?: Record<string, unknown> | null | undefined;
  extractedText?: string | null | undefined;
};

export type InMemoryAdminDocumentRecord = {
  id: string;
  title?: string | undefined;
  uploadedBy?: string | null | undefined;
  categoryId?: string | null | undefined;
  metadata?: InMemoryAdminDocumentMetadataRecord | null | undefined;
  createdAt: Date;
  updatedAt?: Date | undefined;
  deletedAt?: Date | null | undefined;
  // Retained for test fixture parity; getSummary includes archived documents per proposed default O7.
  archivedAt?: Date | null | undefined;
  hasFile: boolean;
  // Retained for test fixture parity with the document schema across processing states.
  processingStatus?: ProcessingStatus | undefined;
};

export type InMemoryAdminDownloadRecord = {
  id: string;
  downloadedAt: Date;
};

function isActiveStoredDocument(
  doc: InMemoryAdminDocumentRecord | undefined,
): doc is InMemoryAdminDocumentRecord {
  if (!doc || !doc.hasFile) {
    return false;
  }
  return doc.deletedAt === undefined || doc.deletedAt === null;
}

export class InMemoryAdminRepository implements IAdminRepository {
  public readonly users = new Map<string, InMemoryAdminUserRecord>();
  public readonly categories = new Map<string, InMemoryAdminCategoryRecord>();
  public readonly documents = new Map<string, InMemoryAdminDocumentRecord>();
  public readonly downloads = new Map<string, InMemoryAdminDownloadRecord>();

  public async getSummary(uploadedSince: Date): Promise<AdminSummary> {
    const usersByRole = {
      member_team: 0,
      head_of_team: 0,
      admin: 0,
    };

    for (const user of this.users.values()) {
      if (user.role in usersByRole) {
        usersByRole[user.role] += 1;
      }
    }

    let totalDocuments = 0;
    let uploadedLast7Days = 0;
    const cutoffMs = uploadedSince.getTime();

    for (const doc of this.documents.values()) {
      if (!isActiveStoredDocument(doc)) {
        continue;
      }
      totalDocuments += 1;
      if (doc.createdAt.getTime() >= cutoffMs) {
        uploadedLast7Days += 1;
      }
    }

    let downloadCount = 0;
    let latestDownloadAtDate: Date | null = null;

    for (const download of this.downloads.values()) {
      downloadCount += 1;
      if (
        latestDownloadAtDate === null ||
        download.downloadedAt.getTime() > latestDownloadAtDate.getTime()
      ) {
        latestDownloadAtDate = download.downloadedAt;
      }
    }

    return {
      usersByRole,
      totalDocuments,
      uploadedLast7Days,
      downloadCount,
      latestDownloadAt: latestDownloadAtDate ? latestDownloadAtDate.toISOString() : null,
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

    const visibleDocs = [...this.documents.values()]
      .filter((doc) => isActiveStoredDocument(doc))
      .sort((left, right) => {
        const timeDelta = right.createdAt.getTime() - left.createdAt.getTime();
        if (timeDelta !== 0) {
          return timeDelta;
        }
        return right.id.localeCompare(left.id);
      });

    const offset = (effectivePage - 1) * effectiveLimit;
    const items = visibleDocs
      .slice(offset, offset + effectiveLimit)
      .map((doc) => this.toListItem(doc));

    return {
      items,
      total: visibleDocs.length,
    };
  }

  public async findDocumentDetailById(documentId: string): Promise<AdminDocumentDetail | null> {
    const doc = this.documents.get(documentId);
    if (!isActiveStoredDocument(doc)) {
      return null;
    }

    const listItem = this.toListItem(doc);
    const category = doc.categoryId ? this.categories.get(doc.categoryId) : undefined;

    return {
      ...listItem,
      categoryId: category ? category.id : null,
      categoryName: category ? category.name : null,
      metadata: doc.metadata
        ? {
            author: doc.metadata.author,
            extractedAt: doc.metadata.extractedAt ? doc.metadata.extractedAt.toISOString() : null,
          }
        : null,
    };
  }

  public async archiveDocument(
    documentId: string,
    now: Date,
  ): Promise<AdminArchiveDocumentResult | null> {
    const doc = this.documents.get(documentId);
    if (!isActiveStoredDocument(doc)) {
      return null;
    }

    if (!doc.archivedAt) {
      doc.archivedAt = now;
      doc.updatedAt = now;
    }

    return {
      id: doc.id,
      archivedAt: doc.archivedAt.toISOString(),
    };
  }

  public async unarchiveDocument(
    documentId: string,
    now: Date,
  ): Promise<AdminUnarchiveDocumentResult | null> {
    const doc = this.documents.get(documentId);
    if (!isActiveStoredDocument(doc)) {
      return null;
    }

    if (doc.archivedAt !== null && doc.archivedAt !== undefined) {
      doc.updatedAt = now;
    }
    doc.archivedAt = null;

    return {
      id: doc.id,
      archivedAt: null,
    };
  }

  public async softDeleteDocument(
    documentId: string,
    now: Date,
  ): Promise<AdminDeleteDocumentResult | null> {
    const doc = this.documents.get(documentId);
    if (!isActiveStoredDocument(doc)) {
      return null;
    }

    doc.deletedAt = now;
    doc.updatedAt = now;

    return {
      id: doc.id,
      deletedAt: now.toISOString(),
    };
  }

  private toListItem(doc: InMemoryAdminDocumentRecord): AdminDocumentListItem {
    const owner = doc.uploadedBy ? this.users.get(doc.uploadedBy) : undefined;
    return {
      id: doc.id,
      title: doc.title ?? doc.id,
      ownerId: owner ? owner.id : null,
      ownerName: owner ? (owner.name ?? owner.email ?? owner.id) : null,
      uploadedAt: doc.createdAt.toISOString(),
      archivedAt: doc.archivedAt ? doc.archivedAt.toISOString() : null,
    };
  }
}
