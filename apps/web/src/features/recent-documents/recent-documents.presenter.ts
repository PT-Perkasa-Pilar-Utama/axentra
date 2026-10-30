import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  bulkDownloadDocuments,
  listRecentDocuments,
  triggerBlobDownload,
} from "./recent-documents.api";
import { TOP_TAGS_QUERY_KEY } from "../top-tags/top-tags.presenter";
import { CATEGORIES_QUERY_KEY } from "../categories/categories.presenter";
import { ApiClientError } from "../../lib/api-client";
import { hasPendingDocument } from "./recent-documents.format";
import { clampPage, totalPagesFor } from "./recent-documents.pagination";
import {
  DOCUMENT_CATEGORY_QUERY_KEY,
  DOCUMENT_SMART_TAGS_QUERY_KEY,
  useRecentDocumentItems,
} from "./recent-documents.items";
import { useRecentDocumentsPageState } from "./recent-documents.page-state";
import { useRecentDocumentsSelection } from "./recent-documents.selection";
import type { RecentDocumentsPresenter } from "./recent-documents.types";

export const RECENT_DOCUMENTS_QUERY_KEY = ["recent-documents"] as const;
const recentDocumentsPollIntervalMs = 2000;

function deriveDownloadDisabledReason(
  selectedCount: number,
  isDownloading: boolean,
): string | undefined {
  if (selectedCount === 0) return "Pilih minimal satu dokumen untuk mengunduh";
  if (isDownloading) return "Sedang mengunduh dokumen...";
  return undefined;
}

export function useRecentDocumentsPresenter(
  limit = 20,
  activeTagNames: readonly string[] = [],
): RecentDocumentsPresenter {
  const queryClient = useQueryClient();
  const isPollingRef = useRef(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Urutan dibuat tetap agar kunci cache stabil; server menerapkan logika AND (AC-04.04).
  const tagsArray = [...activeTagNames].sort((a, b) => a.localeCompare(b));
  const isFilterActive = tagsArray.length > 0;
  // Scope adalah filter tag; setiap perubahannya mengembalikan halaman ke 1.
  const scope = JSON.stringify(tagsArray);
  const { requestedPage, setRequestedPage } = useRecentDocumentsPageState(scope);

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
  const isLoading = query.isPending;
  const isError = query.isError;
  const isChanging = query.isPlaceholderData;
  const isPending =
    hasPendingDocument(documents) ||
    (isFilterActive && hasPendingDocument(pendingMonitorQuery.data?.items ?? []));

  // Total yang menyusut (mis. setelah unggah) membuat halaman saat ini di luar rentang.
  if (query.data !== undefined && !query.isPlaceholderData && requestedPage > totalPages) {
    setRequestedPage(totalPages);
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

  const visibleIds = useMemo(() => new Set(documents.map((document) => document.id)), [documents]);
  // Pilihan terikat pada halaman dan filter, sehingga berganti keduanya membuang pilihan lama.
  const {
    selectedIds,
    toggleSelect: toggleSelection,
    clearSelection: clearSelectedIds,
  } = useRecentDocumentsSelection(`${scope}#${requestedPage}`, visibleIds);
  const items = useRecentDocumentItems(documents, selectedIds);

  const toggleSelect = useCallback(
    (id: string): void => {
      if (!visibleIds.has(id)) return;
      setDownloadError(null);
      toggleSelection(id);
    },
    [toggleSelection, visibleIds],
  );

  const clearSelection = useCallback((): void => {
    clearSelectedIds();
    setDownloadError(null);
  }, [clearSelectedIds]);

  const goToPage = useCallback(
    (target: number): void => {
      const nextPage = clampPage(target, totalPages);
      if (nextPage === requestedPage) return;
      setDownloadError(null);
      setRequestedPage(nextPage);
    },
    [requestedPage, setRequestedPage, totalPages],
  );

  const goToPrevious = useCallback((): void => {
    goToPage(page - 1);
  }, [goToPage, page]);

  const goToNext = useCallback((): void => {
    goToPage(page + 1);
  }, [goToPage, page]);

  const downloadSelected = useCallback(async (): Promise<void> => {
    if (selectedIds.size === 0 || isDownloading) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const blob = await bulkDownloadDocuments([...selectedIds]);
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
  }, [clearSelection, isDownloading, selectedIds]);

  const refresh = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: [...RECENT_DOCUMENTS_QUERY_KEY] });
  }, [queryClient]);

  const retry = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);

  return {
    isLoading,
    isError,
    isEmpty: !isLoading && !isError && total === 0,
    hasItems: !isLoading && !isError && items.length > 0,
    items,
    pagination: {
      page,
      totalPages,
      pageLabel: `Halaman ${page} dari ${totalPages}`,
      canGoPrevious: page > 1 && !isChanging,
      canGoNext: page < totalPages && !isChanging,
      isChanging,
      goToPage,
      goToPrevious,
      goToNext,
    },
    refresh,
    retry,
    selectedIds,
    isDownloading,
    downloadError,
    canDownloadSelected: selectedIds.size > 0 && !isDownloading,
    downloadDisabledReason: deriveDownloadDisabledReason(selectedIds.size, isDownloading),
    toggleSelect,
    clearSelection,
    downloadSelected,
  };
}
