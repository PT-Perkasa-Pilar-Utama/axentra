import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";

import {
  bulkDownloadDocuments,
  getDocumentSmartTags,
  listRecentDocuments,
  triggerBlobDownload,
} from "./recent-documents.api";
import type { RecentDocument } from "./recent-documents.api";
import { TOP_TAGS_QUERY_KEY } from "../top-tags/top-tags.presenter";
import { ApiClientError } from "../../lib/api-client";

export const RECENT_DOCUMENTS_QUERY_KEY = ["recent-documents"] as const;
const recentDocumentsPollIntervalMs = 2000;

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
};

export type RecentDocumentsPresenter = {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  items: RecentDocumentItem[];
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  selectedIds: ReadonlySet<string>;
  isDownloading: boolean;
  downloadError: string | null;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  downloadSelected: () => Promise<void>;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatStatus(status: RecentDocument["processingStatus"]): string {
  switch (status) {
    case "completed":
      return "Selesai Diproses";
    case "processing":
      return "Sedang Diproses";
    case "queued":
      return "Dalam Antrean";
    case "failed":
      return "Gagal";
  }
}

function hasPendingDocument(documents: readonly RecentDocument[]): boolean {
  return documents.some(
    (document) =>
      document.processingStatus === "queued" || document.processingStatus === "processing",
  );
}

export const DOCUMENT_SMART_TAGS_QUERY_KEY = ["document-smart-tags"] as const;

export function useRecentDocumentsPresenter(
  limit = 20,
  activeTagNames?: ReadonlySet<string>,
): RecentDocumentsPresenter {
  const queryClient = useQueryClient();
  const isPollingRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const tagsArray = activeTagNames ? Array.from(activeTagNames) : [];
  const isFilterActive = tagsArray.length > 0;

  const query = useQuery({
    queryKey: [...RECENT_DOCUMENTS_QUERY_KEY, limit, tagsArray],
    queryFn: () => listRecentDocuments(1, limit, tagsArray),
    staleTime: 30 * 1000,
    retry: 1,
    refetchInterval: (current) =>
      hasPendingDocument(current.state.data ?? []) ? recentDocumentsPollIntervalMs : false,
  });

  const pendingMonitorQuery = useQuery({
    queryKey: [...RECENT_DOCUMENTS_QUERY_KEY, "pending-monitor"],
    queryFn: () => listRecentDocuments(1, 20, []),
    staleTime: 30 * 1000,
    retry: 1,
    enabled: isFilterActive,
    refetchInterval: (current) =>
      hasPendingDocument(current.state.data ?? []) ? recentDocumentsPollIntervalMs : false,
  });

  const documents = useMemo(() => query.data ?? [], [query.data]);
  const isPending =
    hasPendingDocument(documents) ||
    (isFilterActive && hasPendingDocument(pendingMonitorQuery.data ?? []));

  useEffect(() => {
    if (isPending) {
      isPollingRef.current = true;
    } else if (isPollingRef.current && !isPending) {
      void queryClient.invalidateQueries({ queryKey: TOP_TAGS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: [...DOCUMENT_SMART_TAGS_QUERY_KEY] });
      if (isFilterActive) {
        void queryClient.invalidateQueries({ queryKey: [...RECENT_DOCUMENTS_QUERY_KEY] });
      }
      isPollingRef.current = false;
    }
  }, [isPending, isFilterActive, queryClient]);

  // Resolusi F9: Orkestrasi fetching tag dilakukan terpusat di Presenter utama menggunakan useQueries
  const smartTagsQueries = useQueries({
    queries: documents.map((doc) => ({
      queryKey: [...DOCUMENT_SMART_TAGS_QUERY_KEY, doc.id],
      queryFn: () => getDocumentSmartTags(doc.id),
      staleTime: 5 * 60 * 1000,
      enabled: doc.processingStatus === "completed",
    })),
  });

  const visibleIds = useMemo(() => new Set(documents.map((document) => document.id)), [documents]);
  const visibleSelectedIds = useMemo(
    () => new Set([...selectedIds].filter((id) => visibleIds.has(id))),
    [selectedIds, visibleIds],
  );
  const isSelected = useCallback(
    (id: string): boolean => visibleSelectedIds.has(id),
    [visibleSelectedIds],
  );

  const toggleSelect = useCallback(
    (id: string): void => {
      if (!visibleIds.has(id)) return;
      setDownloadError(null);
      setSelectedIds((current) => {
        const next = new Set([...current].filter((selectedId) => visibleIds.has(selectedId)));
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [visibleIds],
  );

  const clearSelection = useCallback((): void => {
    setSelectedIds(new Set());
    setDownloadError(null);
  }, []);

  const downloadSelected = useCallback(async (): Promise<void> => {
    if (visibleSelectedIds.size === 0 || isDownloading) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const blob = await bulkDownloadDocuments([...visibleSelectedIds]);
      triggerBlobDownload(blob);
      setSelectedIds(new Set());
    } catch (error) {
      setDownloadError(
        error instanceof ApiClientError
          ? error.message
          : "Gagal mengunduh dokumen yang dipilih. Coba lagi.",
      );
    } finally {
      setIsDownloading(false);
    }
  }, [isDownloading, visibleSelectedIds]);

  const items: RecentDocumentItem[] = documents.map((doc, index) => {
    const tagQuery = smartTagsQueries[index];
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
    isEmpty: !query.isPending && !query.isError && documents.length === 0,
    items,
    refresh,
    retry,
    selectedIds: visibleSelectedIds,
    isDownloading,
    downloadError,
    toggleSelect,
    clearSelection,
    isSelected,
    downloadSelected,
  };
}
