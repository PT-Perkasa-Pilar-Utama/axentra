import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { listRecentDocuments } from "./recent-documents.api";
import type { RecentDocument } from "./recent-documents.api";

export const RECENT_DOCUMENTS_QUERY_KEY = ["recent-documents"] as const;
const recentDocumentsPollIntervalMs = 2000;

export type RecentDocumentItem = {
  id: string;
  filename: string;
  dateLabel: string;
  statusLabel: string;
  processingStatus: RecentDocument["processingStatus"];
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
  };
}

function hasPendingDocument(documents: readonly RecentDocument[]): boolean {
  return documents.some(
    (document) =>
      document.processingStatus === "queued" || document.processingStatus === "processing",
  );
}

export function useRecentDocumentsPresenter(limit = 20): RecentDocumentsPresenter {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...RECENT_DOCUMENTS_QUERY_KEY, limit],
    queryFn: () => listRecentDocuments(1, limit),
    staleTime: 30 * 1000,
    retry: 1,
    refetchInterval: (current) =>
      hasPendingDocument(current.state.data ?? []) ? recentDocumentsPollIntervalMs : false,
  });

  const documents = query.data ?? [];

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
