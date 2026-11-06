import {
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_DEFAULT_PAGE,
  ADMIN_LIST_MAX_LIMIT,
  ADMIN_LIST_MAX_PAGE,
  ADMIN_SUMMARY_UPLOAD_WINDOW_DAYS,
  type AdminArchiveDocumentResult,
  type AdminDeleteDocumentResult,
  type AdminDocumentDetail,
  type AdminDocumentListItem,
  type AdminDocumentsListQuery,
  type AdminSummary,
  type AdminUnarchiveDocumentResult,
  type PaginationMeta,
} from "@axentra/shared";
import { NotFoundError } from "../../http/errors";
import { InMemoryAdminRepository, type IAdminRepository } from "./admin.repository";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const DOCUMENT_NOT_FOUND_MESSAGE = "Dokumen tidak ditemukan";

export type AdminDocumentsListResult = {
  items: ReadonlyArray<AdminDocumentListItem>;
  meta: PaginationMeta;
};

export type AdminService = {
  getSummary: () => Promise<AdminSummary>;
  listDocuments: (query?: AdminDocumentsListQuery) => Promise<AdminDocumentsListResult>;
  getDocumentDetail: (documentId: string) => Promise<AdminDocumentDetail>;
  archiveDocument: (documentId: string) => Promise<AdminArchiveDocumentResult>;
  unarchiveDocument: (documentId: string) => Promise<AdminUnarchiveDocumentResult>;
  deleteDocument: (documentId: string) => Promise<AdminDeleteDocumentResult>;
};

export type AdminServiceOptions = {
  now?: (() => Date) | undefined;
};

export function createAdminService(
  repository: IAdminRepository = new InMemoryAdminRepository(),
  options?: AdminServiceOptions | undefined,
): AdminService {
  const now = options?.now ?? (() => new Date());

  return {
    async getSummary(): Promise<AdminSummary> {
      const uploadedSince = new Date(
        now().getTime() - ADMIN_SUMMARY_UPLOAD_WINDOW_DAYS * MILLISECONDS_PER_DAY,
      );
      return repository.getSummary(uploadedSince);
    },

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

    async archiveDocument(documentId: string): Promise<AdminArchiveDocumentResult> {
      const result = await repository.archiveDocument(documentId, now());
      if (!result) {
        throw new NotFoundError(DOCUMENT_NOT_FOUND_MESSAGE);
      }
      return result;
    },

    async unarchiveDocument(documentId: string): Promise<AdminUnarchiveDocumentResult> {
      const result = await repository.unarchiveDocument(documentId, now());
      if (!result) {
        throw new NotFoundError(DOCUMENT_NOT_FOUND_MESSAGE);
      }
      return result;
    },

    async deleteDocument(documentId: string): Promise<AdminDeleteDocumentResult> {
      const result = await repository.softDeleteDocument(documentId, now());
      if (!result) {
        throw new NotFoundError(DOCUMENT_NOT_FOUND_MESSAGE);
      }
      return result;
    },
  };
}
