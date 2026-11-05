import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DOWNLOAD_AUDIT_DEFAULT_LIMIT,
  DOWNLOAD_AUDIT_DEFAULT_PAGE,
  DOWNLOAD_AUDIT_MAX_PAGE,
} from "@axentra/shared";
import { ApiClientError } from "../../lib/api-client";
import { createTransientRetry } from "../../lib/query-retry";
import {
  archiveAdminDocument,
  deleteAdminDocument,
  listAdminDocuments,
  unarchiveAdminDocument,
  getAdminDocument,
  type AdminDocument,
  type AdminDocumentDetail,
  type AdminDocumentsPage,
} from "./admin-documents.api";

export const ADMIN_DOCUMENTS_QUERY_KEY = ["admin-documents"] as const;

export type AdminDocumentTab = "active" | "archived";

export type AdminDocumentsPresenterOptions = {
  fetchFn?: (page: number, limit: number) => Promise<AdminDocumentsPage>;
};

export type AdminDocumentsPresenter = {
  items: AdminDocument[];
  currentTab: AdminDocumentTab;
  setTab: (tab: AdminDocumentTab) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  page: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
  isLoading: boolean;
  isError: boolean;
  isAccessDenied: boolean;
  deleteTarget: AdminDocument | null;
  archiveTarget: AdminDocument | null;
  unarchiveTarget: AdminDocument | null;
  isMutating: boolean;
  mutationError: string | null;
  previousPage: () => void;
  nextPage: () => void;
  retry: () => void;
  openDeleteConfirm: (doc: AdminDocument) => void;
  closeDeleteConfirm: () => void;
  confirmDelete: () => Promise<void>;
  openArchiveConfirm: (doc: AdminDocument) => void;
  closeArchiveConfirm: () => void;
  confirmArchive: () => Promise<void>;
  openUnarchiveConfirm: (doc: AdminDocument) => void;
  closeUnarchiveConfirm: () => void;
  confirmUnarchive: () => Promise<void>;
  selectedDetailId: string | null;
  openDetail: (doc: AdminDocument) => void;
  closeDetail: () => void;
  detail: AdminDocumentDetail | null;
  isDetailLoading: boolean;
};

export function useAdminDocumentsPresenter(
  options: AdminDocumentsPresenterOptions = {},
): AdminDocumentsPresenter {
  const queryClient = useQueryClient();
  const fetchFn = options.fetchFn ?? listAdminDocuments;
  const [page, setPage] = useState(DOWNLOAD_AUDIT_DEFAULT_PAGE);
  const [currentTab, setTab] = useState<AdminDocumentTab>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminDocument | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AdminDocument | null>(null);
  const [unarchiveTarget, setUnarchiveTarget] = useState<AdminDocument | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: [...ADMIN_DOCUMENTS_QUERY_KEY, page],
    queryFn: () => fetchFn(page, DOWNLOAD_AUDIT_DEFAULT_LIMIT),
    retry: createTransientRetry(1),
  });

  const detailQuery = useQuery({
    queryKey: [...ADMIN_DOCUMENTS_QUERY_KEY, "detail", selectedDetailId],
    queryFn: () => (selectedDetailId ? getAdminDocument(selectedDetailId) : null),
    enabled: Boolean(selectedDetailId),
    retry: createTransientRetry(1),
  });

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ADMIN_DOCUMENTS_QUERY_KEY });
  }, [queryClient]);

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveAdminDocument(id),
    onSuccess: async () => {
      setArchiveTarget(null);
      setMutationError(null);
      await invalidate();
    },
    onError: (err) => {
      setMutationError(
        err instanceof ApiClientError && err.status === 403
          ? "Anda tidak memiliki izin untuk mengarsipkan dokumen."
          : "Gagal mengarsipkan dokumen. Silakan coba lagi.",
      );
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => unarchiveAdminDocument(id),
    onSuccess: async () => {
      setUnarchiveTarget(null);
      setMutationError(null);
      await invalidate();
    },
    onError: (err) => {
      setMutationError(
        err instanceof ApiClientError && err.status === 403
          ? "Anda tidak memiliki izin untuk membatalkan arsip dokumen."
          : "Gagal membatalkan arsip dokumen. Silakan coba lagi.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminDocument(id),
    onSuccess: async () => {
      setDeleteTarget(null);
      setMutationError(null);
      await invalidate();
    },
    onError: (err) => {
      setMutationError(
        err instanceof ApiClientError && err.status === 403
          ? "Anda tidak memiliki izin untuk menghapus dokumen."
          : "Gagal menghapus dokumen. Silakan coba lagi.",
      );
    },
  });

  const allItems = query.data?.items ?? [];
  const activeItems = allItems.filter((item) => item.archivedAt === null);
  const archivedItems = allItems.filter((item) => item.archivedAt !== null);
  const tabFilteredItems = currentTab === "active" ? activeItems : archivedItems;
  const items = tabFilteredItems.filter((item) =>
    item.title.toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );
  // ponytail: filter berlaku satu halaman; gunakan filter API saat kontrak mendukungnya.

  const total = query.data?.meta.total ?? 0;
  const isAccessDenied = query.error instanceof ApiClientError && query.error.status === 403;
  const isMutating =
    deleteMutation.isPending || archiveMutation.isPending || unarchiveMutation.isPending;

  return {
    items,
    currentTab,
    setTab,
    searchQuery,
    setSearchQuery,
    page,
    total,
    hasPrevious: page > 1,
    hasNext: page * DOWNLOAD_AUDIT_DEFAULT_LIMIT < total && page < DOWNLOAD_AUDIT_MAX_PAGE,
    isLoading: query.isLoading,
    isError: query.isError && !isAccessDenied,
    isAccessDenied,
    deleteTarget,
    archiveTarget,
    unarchiveTarget,
    isMutating,
    mutationError,
    previousPage: () => setPage((p) => Math.max(1, p - 1)),
    nextPage: () => setPage((p) => (p < DOWNLOAD_AUDIT_MAX_PAGE ? p + 1 : p)),
    retry: () => void query.refetch(),
    openDeleteConfirm: (doc) => {
      setMutationError(null);
      setDeleteTarget(doc);
    },
    closeDeleteConfirm: () => {
      if (!isMutating) setDeleteTarget(null);
    },
    confirmDelete: async () => {
      if (!deleteTarget || isMutating) return;
      try {
        await deleteMutation.mutateAsync(deleteTarget.id);
      } catch {
        // Exposed via mutationError
      }
    },
    openArchiveConfirm: (doc) => {
      setMutationError(null);
      setArchiveTarget(doc);
    },
    closeArchiveConfirm: () => {
      if (!isMutating) setArchiveTarget(null);
    },
    confirmArchive: async () => {
      if (!archiveTarget || isMutating) return;
      try {
        await archiveMutation.mutateAsync(archiveTarget.id);
      } catch {
        // Exposed via mutationError
      }
    },
    openUnarchiveConfirm: (doc) => {
      setMutationError(null);
      setUnarchiveTarget(doc);
    },
    closeUnarchiveConfirm: () => {
      if (!isMutating) setUnarchiveTarget(null);
    },
    confirmUnarchive: async () => {
      if (!unarchiveTarget || isMutating) return;
      try {
        await unarchiveMutation.mutateAsync(unarchiveTarget.id);
      } catch {
        // Exposed via mutationError
      }
    },
    selectedDetailId,
    openDetail: (doc: AdminDocument) => setSelectedDetailId(doc.id),
    closeDetail: () => setSelectedDetailId(null),
    detail: detailQuery.data ?? null,
    isDetailLoading: detailQuery.isLoading,
  };
}
