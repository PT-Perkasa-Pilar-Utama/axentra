import {
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_DEFAULT_PAGE,
  ADMIN_LIST_MAX_LIMIT,
  ADMIN_LIST_MAX_PAGE,
  type AdminDocumentDetail,
  type AdminDocumentListItem,
  type AdminDocumentsListQuery,
} from "@axentra/shared";
import type {
  AdminDocumentAuditRecord,
  AdminDocumentsPage,
  AdminManagedDocumentRow,
  IAdminDocumentRepository,
} from "./admin.documents.repository";

export type InMemoryAdminDocumentOwnerRecord = {
  id: string;
  name: string | null;
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

export type InMemoryAdminManagedDocumentRecord = {
  id: string;
  title: string;
  uploadedBy?: string | null | undefined;
  categoryId?: string | null | undefined;
  metadata?: InMemoryAdminDocumentMetadataRecord | null | undefined;
  createdAt: Date;
  updatedAt?: Date | undefined;
  deletedAt?: Date | null | undefined;
  archivedAt?: Date | null | undefined;
  hasFile: boolean;
};

function isActiveStoredDocument(
  doc: InMemoryAdminManagedDocumentRecord | undefined,
): doc is InMemoryAdminManagedDocumentRecord {
  if (!doc || !doc.hasFile) {
    return false;
  }
  return doc.deletedAt === undefined || doc.deletedAt === null;
}

// Unit-test double. It has no real rollback; the Drizzle repository and integration tests cover transactions.
export class InMemoryAdminDocumentRepository implements IAdminDocumentRepository {
  public readonly users = new Map<string, InMemoryAdminDocumentOwnerRecord>();
  public readonly categories = new Map<string, InMemoryAdminCategoryRecord>();
  public readonly documents = new Map<string, InMemoryAdminManagedDocumentRecord>();
  public readonly auditRecords: AdminDocumentAuditRecord[] = [];
  public transactionCount = 0;

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

  public async runInTransaction<T>(work: (tx: IAdminDocumentRepository) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    return work(this);
  }

  public async findStoredDocumentForUpdate(
    documentId: string,
  ): Promise<AdminManagedDocumentRow | null> {
    const doc = this.documents.get(documentId);
    if (!isActiveStoredDocument(doc)) {
      return null;
    }
    return {
      id: doc.id,
      title: doc.title,
      archivedAt: doc.archivedAt ?? null,
      deletedAt: doc.deletedAt ?? null,
    };
  }

  public async setArchivedAt(
    documentId: string,
    archivedAt: Date | null,
    updatedAt: Date,
  ): Promise<void> {
    const doc = this.documents.get(documentId);
    if (doc) {
      this.documents.set(documentId, { ...doc, archivedAt, updatedAt });
    }
  }

  public async setDeletedAt(documentId: string, deletedAt: Date, updatedAt: Date): Promise<void> {
    const doc = this.documents.get(documentId);
    if (doc) {
      this.documents.set(documentId, { ...doc, deletedAt, updatedAt });
    }
  }

  public async insertDocumentAudit(record: AdminDocumentAuditRecord): Promise<void> {
    this.auditRecords.push(record);
  }

  private toListItem(doc: InMemoryAdminManagedDocumentRecord): AdminDocumentListItem {
    const owner = doc.uploadedBy ? this.users.get(doc.uploadedBy) : undefined;
    return {
      id: doc.id,
      title: doc.title,
      ownerId: owner ? owner.id : null,
      ownerName: owner ? (owner.name ?? null) : null,
      uploadedAt: doc.createdAt.toISOString(),
      archivedAt: doc.archivedAt ? doc.archivedAt.toISOString() : null,
    };
  }
}
