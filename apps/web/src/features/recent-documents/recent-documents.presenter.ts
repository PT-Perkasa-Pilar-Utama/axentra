import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";

import {
  bulkDownloadDocuments,
  getDocumentCategory,
  getDocumentSmartTags,
  listRecentDocuments,
  triggerBlobDownload,
} from "./recent-documents.api";
import type { RecentDocument } from "./recent-documents.api";
import { TOP_TAGS_QUERY_KEY } from "../top-tags/top-tags.presenter";
import { CATEGORIES_QUERY_KEY } from "../categories/categories.presenter";
import { ApiClientError } from "../../lib/api-client";
import { formatDate, formatStatus, hasPendingDocument } from "./recent-documents.format";
import { clampPage, totalPagesFor } from "./recent-documents.pagination";

export const RECENT_DOCUMENTS_QUERY_KEY = ["recent-documents"] as const;
const recentDocumentsPollIntervalMs = 2000;

export const DOCUMENT_SMART_TAGS_QUERY_KEY = ["document-smart-tags"] as const;
export const DOCUMENT_CATEGORY_QUERY_KEY = ["document-category"] as const;

export type DocumentSmartTagItem = {
  id: string;
  name: string;
};

export type DocumentSmartTagsState = {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  tags: DocumentSmartTagItem[];
  retry: () => void;
};

export type RecentDocumentItem = {
  id: string;
  filename: string;
  dateLabel: string;
  statusLabel: string;
  processingStatus: RecentDocument["processingStatus"];
  smartTags: DocumentSmartTagsState;
  isSelected: boolean;
  category: {
    isLoading: boolean;
    isError: boolean;
    name: string | null;
    retry: () => void;
  };
};

export type RecentDocumentsPagination = {
  /** Halaman yang ditampilkan, sudah dibatasi ke rentang [1, totalPages]. */
  page: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
  /** true saat halaman baru sedang dimuat; navigasi dinonaktifkan selama itu. */
  isChanging: boolean;
  goToPage: (page: number) => void;
};

export type RecentDocumentsPresenter = {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  items: RecentDocumentItem[];
  pagination: RecentDocumentsPagination;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  selectedIds: ReadonlySet<string>;
  isDownloading: boolean;
  downloadError: string | null;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  downloadSelected: () => Promise<void>;
};

type PageState = { scope: string; page: number };
type SelectionState = { key: string; ids: ReadonlySet<string> };

const NO_SELECTION: ReadonlySet<string> = new Set();
const EMPTY_SELECTION: SelectionState = { key: "", ids: NO_SELECTION };

export function useRecentDocumentsPresenter(
  limit = 20,
  activeTagNames: readonly string[] = [],
): RecentDocumentsPresenter {
  const queryClient = useQueryClient();
  const isPollingRef = useRef(false);
  const [pageState, setPageState] = useState<PageState>({ scope: "", page: 1 });
  const [selection, setSelection] = useState<SelectionState>({ key: "", ids: NO_SELECTION });
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Urutan dibuat tetap agar kunci cache stabil; server menerapkan logika AND (AC-04.04).
  const tagsArray = [...activeTagNames].sort((a, b) => a.localeCompare(b));
  const isFilterActive = tagsArray.length > 0;
  // Halaman kembali ke 1 saat filter tag berubah, karena jumlah hasilnya ikut berubah.
  const scope = JSON.stringify(tagsArray);
  const requestedPage = pageState.scope === scope ? pageState.page : 1;

  const query = useQuery({
    queryKey: [...RECENT_DOCUMENTS_QUERY_KEY, limit, tagsArray, requestedPage],
    queryFn: () => listRecentDocuments(requestedPage, limit, tagsArray),
    // Halaman sebelumnya tetap tampil saat halaman lain dimuat, kecuali filter tag berubah.
    placeholderData: (previousData, previousQuery) =>
      previousQuery !== undefined && JSON.stringify(previousQuery.queryKey[2]) === scope
        ? previousData
        : undefined,
    staleTime: 30 * 1000,
    retry: 1,
    refetchInterval: (current) =>
      hasPendingDocument(current.state.data?.items ?? []) ? recentDocumentsPollIntervalMs : false,
  });

  const pendingMonitorQuery = useQuery({
    queryKey: [...RECENT_DOCUMENTS_QUERY_KEY, "pending-monitor"],
    queryFn: () => listRecentDocuments(1, 20, []),
    staleTime: 30 * 1000,
    retry: 1,
    enabled: isFilterActive,
    refetchInterval: (current) =>
      hasPendingDocument(current.state.data?.items ?? []) ? recentDocumentsPollIntervalMs : false,
  });

  const documents = useMemo(() => query.data?.items ?? [], [query.data]);
  const total = query.data?.meta.total ?? 0;
  const totalPages = totalPagesFor(total, limit);
  const page = clampPage(query.data?.meta.page ?? requestedPage, totalPages);
  const isPending =
    hasPendingDocument(documents) ||
    (isFilterActive && hasPendingDocument(pendingMonitorQuery.data?.items ?? []));

  // Total yang menyusut (mis. setelah unggah) membuat halaman saat ini di luar rentang.
  if (query.data !== undefined && !query.isPlaceholderData && requestedPage > totalPages) {
    setPageState({ scope, page: totalPages });
  }

  useEffect(() => {
    if (isPending) {
      isPollingRef.current = true;
    } else if (isPollingRef.current && !isPending) {
      void queryClient.invalidateQueries({ queryKey: TOP_TAGS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: [...DOCUMENT_SMART_TAGS_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: [...DOCUMENT_CATEGORY_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
      if (isFilterActive) {
        void queryClient.invalidateQueries({ queryKey: [...RECENT_DOCUMENTS_QUERY_KEY] });
      }
      isPollingRef.current = false;
    }
  }, [isPending, isFilterActive, queryClient]);

  const smartTagsQueries = useQueries({
    queries: documents.map((doc) => ({
      queryKey: [...DOCUMENT_SMART_TAGS_QUERY_KEY, doc.id],
      queryFn: () => getDocumentSmartTags(doc.id),
      staleTime: 5 * 60 * 1000,
      enabled: doc.processingStatus === "completed",
    })),
  });
  const categoryQueries = useQueries({
    queries: documents.map((doc) => ({
      queryKey: [...DOCUMENT_CATEGORY_QUERY_KEY, doc.id],
      queryFn: () => getDocumentCategory(doc.id),
      staleTime: 5 * 60 * 1000,
      enabled: doc.processingStatus === "completed",
    })),
  });

  // Pilihan terikat pada halaman dan filter. Saat kunci berubah, pilihan lama dibuang
  // agar tidak muncul kembali ketika pengguna kembali ke halaman tersebut.
  const selectionKey = `${scope}#${requestedPage}`;
  const selectedIds = selection.key === selectionKey ? selection.ids : NO_SELECTION;
  if (selection.key !== selectionKey && selection.ids.size > 0) {
    setSelection(EMPTY_SELECTION);
  }
  const visibleIds = useMemo(() => new Set(documents.map((document) => document.id)), [documents]);
  const visibleSelectedIds = useMemo(
    () => new Set([...selectedIds].filter((id) => visibleIds.has(id))),
    [selectedIds, visibleIds],
  );

  const toggleSelect = useCallback(
    (id: string): void => {
      if (!visibleIds.has(id)) return;
      setDownloadError(null);
      setSelection((current) => {
        const base = current.key === selectionKey ? current.ids : NO_SELECTION;
        const next = new Set([...base].filter((selectedId) => visibleIds.has(selectedId)));
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { key: selectionKey, ids: next };
      });
    },
    [selectionKey, visibleIds],
  );

  const clearSelection = useCallback((): void => {
    setSelection({ key: selectionKey, ids: NO_SELECTION });
    setDownloadError(null);
  }, [selectionKey]);

  const goToPage = useCallback(
    (target: number): void => {
      const nextPage = clampPage(target, totalPages);
      if (nextPage === requestedPage) return;
      setDownloadError(null);
      setPageState({ scope, page: nextPage });
    },
    [requestedPage, scope, totalPages],
  );

  const downloadSelected = useCallback(async (): Promise<void> => {
    if (visibleSelectedIds.size === 0 || isDownloading) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const blob = await bulkDownloadDocuments([...visibleSelectedIds]);
      triggerBlobDownload(blob);
      clearSelection();
    } catch (error) {
      setDownloadError(
        error instanceof ApiClientError
          ? error.message
          : "Gagal mengunduh dokumen yang dipilih. Coba lagi.",
      );
    } finally {
      setIsDownloading(false);
    }
  }, [clearSelection, isDownloading, visibleSelectedIds]);

  const items: RecentDocumentItem[] = documents.map((doc, index) => {
    const tagQuery = smartTagsQueries[index];
    const categoryQuery = categoryQueries[index];
    return {
      id: doc.id,
      filename: doc.filename,
      dateLabel: formatDate(doc.createdAt),
      statusLabel: formatStatus(doc.processingStatus),
      processingStatus: doc.processingStatus,
      smartTags: {
        isLoading: tagQuery?.isFetching ?? false,
        isError: tagQuery?.isError ?? false,
        isEmpty: !tagQuery?.isFetching && !tagQuery?.isError && (tagQuery?.data?.length ?? 0) === 0,
        tags: tagQuery?.data ?? [],
        retry: () => {
          void tagQuery?.refetch();
        },
      },
      isSelected: visibleSelectedIds.has(doc.id),
      category: {
        isLoading: categoryQuery?.isFetching ?? false,
        isError: categoryQuery?.isError ?? false,
        name: categoryQuery?.data?.name ?? null,
        retry: () => {
          void categoryQuery?.refetch();
        },
      },
    };
  });

  const refresh = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: [...RECENT_DOCUMENTS_QUERY_KEY] });
  }, [queryClient]);

  const retry = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);

  return {
    isLoading: query.isPending,
    isError: query.isError,
    isEmpty: !query.isPending && !query.isError && total === 0,
    items,
    pagination: {
      page,
      totalPages,
      hasPrevious: page > 1,
      hasNext: page < totalPages,
      isChanging: query.isPlaceholderData,
      goToPage,
    },
    refresh,
    retry,
    selectedIds: visibleSelectedIds,
    isDownloading,
    downloadError,
    toggleSelect,
    clearSelection,
    downloadSelected,
  };
}
