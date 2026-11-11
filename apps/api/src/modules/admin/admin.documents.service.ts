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
  type AdminUnarchiveDocumentResult,
  type AuthUser,
  type PaginationMeta,
} from "@axentra/shared";
import { NotFoundError } from "../../http/errors";
import type { IAdminDocumentRepository } from "./admin.documents.repository";

const DOCUMENT_NOT_FOUND_MESSAGE = "Dokumen tidak ditemukan";

export type AdminDocumentsListResult = {
  items: ReadonlyArray<AdminDocumentListItem>;
  meta: PaginationMeta;
};

export type AdminDocumentMutationInput = {
  actor: AuthUser;
  documentId: string;
};

export type AdminDocumentService = {
  listDocuments: (query?: AdminDocumentsListQuery) => Promise<AdminDocumentsListResult>;
  getDocumentDetail: (documentId: string) => Promise<AdminDocumentDetail>;
  archiveDocument: (input: AdminDocumentMutationInput) => Promise<AdminArchiveDocumentResult>;
  unarchiveDocument: (input: AdminDocumentMutationInput) => Promise<AdminUnarchiveDocumentResult>;
  deleteDocument: (input: AdminDocumentMutationInput) => Promise<AdminDeleteDocumentResult>;
};

export type AdminDocumentServiceOptions = {
  now?: (() => Date) | undefined;
};

export function createAdminDocumentService(
  repository: IAdminDocumentRepository,
  options?: AdminDocumentServiceOptions | undefined,
): AdminDocumentService {
  const now = options?.now ?? (() => new Date());

  return {
    async listDocuments(
      query: AdminDocumentsListQuery = {
        page: ADMIN_LIST_DEFAULT_PAGE,
        limit: ADMIN_LIST_DEFAULT_LIMIT,
      },
    ): Promise<AdminDocumentsListResult> {
      const page = Math.min(Math.max(1, query.page), ADMIN_LIST_MAX_PAGE);
      const limit = Math.min(Math.max(1, query.limit), ADMIN_LIST_MAX_LIMIT);
      const result = await repository.listDocuments({ page, limit });
      return {
        items: result.items,
        meta: {
          page,
          limit,
          total: result.total,
        },
      };
    },

    async getDocumentDetail(documentId: string): Promise<AdminDocumentDetail> {
      const detail = await repository.findDocumentDetailById(documentId);
      if (!detail) {
        throw new NotFoundError(DOCUMENT_NOT_FOUND_MESSAGE);
      }
      return detail;
    },

    async archiveDocument(input: AdminDocumentMutationInput): Promise<AdminArchiveDocumentResult> {
      const changedAt = now();
      return repository.runInTransaction(async (tx) => {
        const target = await tx.findStoredDocumentForUpdate(input.documentId);
        if (target === null || target.deletedAt !== null) {
          throw new NotFoundError(DOCUMENT_NOT_FOUND_MESSAGE);
        }
        if (target.archivedAt !== null) {
          return { id: target.id, archivedAt: target.archivedAt.toISOString() };
        }

        await tx.setArchivedAt(target.id, changedAt, changedAt);
        await tx.insertDocumentAudit({
          documentId: target.id,
          documentTitle: target.title,
          action: "archive",
          previousArchivedAt: null,
          newArchivedAt: changedAt,
          previousDeletedAt: null,
          newDeletedAt: null,
          actorUserId: input.actor.id,
          actorName: input.actor.name ?? null,
          actorEmail: input.actor.email,
          changedAt,
        });

        return { id: target.id, archivedAt: changedAt.toISOString() };
      });
    },

    async unarchiveDocument(
      input: AdminDocumentMutationInput,
    ): Promise<AdminUnarchiveDocumentResult> {
      const changedAt = now();
      return repository.runInTransaction(async (tx) => {
        const target = await tx.findStoredDocumentForUpdate(input.documentId);
        if (target === null || target.deletedAt !== null) {
          throw new NotFoundError(DOCUMENT_NOT_FOUND_MESSAGE);
        }
        if (target.archivedAt === null) {
          return { id: target.id, archivedAt: null };
        }

        await tx.setArchivedAt(target.id, null, changedAt);
        await tx.insertDocumentAudit({
          documentId: target.id,
          documentTitle: target.title,
          action: "unarchive",
          previousArchivedAt: target.archivedAt,
          newArchivedAt: null,
          previousDeletedAt: null,
          newDeletedAt: null,
          actorUserId: input.actor.id,
          actorName: input.actor.name ?? null,
          actorEmail: input.actor.email,
          changedAt,
        });

        return { id: target.id, archivedAt: null };
      });
    },

    async deleteDocument(input: AdminDocumentMutationInput): Promise<AdminDeleteDocumentResult> {
      const changedAt = now();
      return repository.runInTransaction(async (tx) => {
        const target = await tx.findStoredDocumentForUpdate(input.documentId);
        if (target === null || target.deletedAt !== null) {
          throw new NotFoundError(DOCUMENT_NOT_FOUND_MESSAGE);
        }

        await tx.setDeletedAt(target.id, changedAt, changedAt);
        await tx.insertDocumentAudit({
          documentId: target.id,
          documentTitle: target.title,
          action: "delete",
          previousArchivedAt: target.archivedAt,
          newArchivedAt: target.archivedAt,
          previousDeletedAt: null,
          newDeletedAt: changedAt,
          actorUserId: input.actor.id,
          actorName: input.actor.name ?? null,
          actorEmail: input.actor.email,
          changedAt,
        });

        return { id: target.id, deletedAt: changedAt.toISOString() };
      });
    },
  };
}
