import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { listRecentDocuments } from "./recent-documents.api";
import type { RecentDocument } from "./recent-documents.api";

// Exported so DashboardPage can invalidate the right key after a successful upload.
export const RECENT_DOCUMENTS_QUERY_KEY = ["recent-documents"] as const;

export type RecentDocumentItem = {
  id: string;
  filename: string;
  dateLabel: string;
  // Null until BE sends the field (confirmed by the assumption note in recent-documents.api.ts).
  sizeLabel: string | null;
  // Sprint 2 fields — empty until FE-S2-01 and FE-S2-03 populate them:
  tags: string[];
  category: string | null;
};

export type RecentDocumentsPresenter = {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  items: RecentDocumentItem[];
  /** Invalidates the cache so the list re-fetches on next focus. */
  refresh: () => void;
  /** Triggers an immediate re-fetch after a network failure. */
  retry: () => void;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Some of these fields (sizeBytes, tags, category) are not part of the current
 * `recentDocumentSchema` contract yet (see packages/shared/src/document.ts) but
 * are read defensively here in case the API adds them ahead of the schema being
 * updated. We read them via `unknown` + narrowing instead of `any` to stay type-safe.
 */
function readOptionalString(source: unknown, key: string): string | undefined {
  if (source === null || typeof source !== "object") return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function readOptionalNumber(source: unknown, key: string): number | undefined {
  if (source === null || typeof source !== "object") return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
}

function readOptionalStringArray(source: unknown, key: string): string[] {
  if (source === null || typeof source !== "object") return [];
  const value = (source as Record<string, unknown>)[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function toRecentDocumentItem(doc: RecentDocument): RecentDocumentItem {
  const dateSource =
    readOptionalString(doc, "createdAt") ?? readOptionalString(doc, "uploadDate") ?? "";
  const sizeBytes = readOptionalNumber(doc, "sizeBytes");

  return {
    id: doc.id,
    filename: doc.filename,
    dateLabel: formatDate(dateSource),
    sizeLabel: sizeBytes != null ? formatFileSize(sizeBytes) : null,
    tags: readOptionalStringArray(doc, "tags"),
    category: readOptionalString(doc, "category") ?? null,
  };
}

export function useRecentDocumentsPresenter(limit = 20): RecentDocumentsPresenter {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...RECENT_DOCUMENTS_QUERY_KEY, limit],
    queryFn: () => listRecentDocuments(1, limit),
    staleTime: 30 * 1000,
    retry: 1,
  });

  const documents = Array.isArray(query.data) ? query.data : [];

  const refresh = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: [...RECENT_DOCUMENTS_QUERY_KEY] });
  }, [queryClient]);

  const retry = useCallback((): void => {
    void query.refetch();
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
