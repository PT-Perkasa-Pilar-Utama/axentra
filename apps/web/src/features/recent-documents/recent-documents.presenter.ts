import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { listRecentDocuments } from "./recent-documents.api";
import type { RecentDocument } from "./recent-documents.api";
import { TOP_TAGS_QUERY_KEY } from "../top-tags/top-tags.presenter";

export const RECENT_DOCUMENTS_QUERY_KEY = ["recent-documents"] as const;
const recentDocumentsPollIntervalMs = 2000;

export type RecentDocumentItem = {
  id: string;
  filename: string;
  dateLabel: string;
  statusLabel: string;
  processingStatus: RecentDocument["processingStatus"];
  tags: { id: string; name: string }[];
};

export type RecentDocumentsPresenter = {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  items: RecentDocumentItem[];
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
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

function toRecentDocumentItem(doc: RecentDocument): RecentDocumentItem {
  return {
    id: doc.id,
    filename: doc.filename,
    dateLabel: formatDate(doc.createdAt),
    statusLabel: formatStatus(doc.processingStatus),
    processingStatus: doc.processingStatus,
    tags: doc.tags ? doc.tags.slice(0, 3) : [],
  };
}

function hasPendingDocument(documents: readonly RecentDocument[]): boolean {
  return documents.some(
    (document) =>
      document.processingStatus === "queued" || document.processingStatus === "processing",
  );
}

export function useRecentDocumentsPresenter(
  limit = 20,
  activeTagNames?: ReadonlySet<string>,
): RecentDocumentsPresenter {
  const queryClient = useQueryClient();
  const isPollingRef = useRef(false);

  const tagsArray = activeTagNames ? Array.from(activeTagNames) : [];

  const query = useQuery({
    queryKey: [...RECENT_DOCUMENTS_QUERY_KEY, limit, tagsArray],
    queryFn: () => listRecentDocuments(1, limit, tagsArray),
    staleTime: 30 * 1000,
    retry: 1,
    refetchInterval: (current) =>
      hasPendingDocument(current.state.data ?? []) ? recentDocumentsPollIntervalMs : false,
  });

  const documents = query.data ?? [];
  const isPending = hasPendingDocument(documents);

  useEffect(() => {
    if (isPending) {
      isPollingRef.current = true;
    } else if (isPollingRef.current && !isPending) {
      void queryClient.invalidateQueries({ queryKey: TOP_TAGS_QUERY_KEY });
      isPollingRef.current = false;
    }
  }, [isPending, queryClient]);

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
    items: documents.map(toRecentDocumentItem),
    refresh,
    retry,
  };
}
