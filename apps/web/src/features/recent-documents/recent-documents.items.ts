import { useQueries } from "@tanstack/react-query";

import { getDocumentCategory, getDocumentSmartTags } from "./recent-documents.api";
import type { RecentDocument } from "./recent-documents.api";
import { formatDate, formatStatus } from "./recent-documents.format";
import type { RecentDocumentItem } from "./recent-documents.types";

export const DOCUMENT_SMART_TAGS_QUERY_KEY = ["document-smart-tags"] as const;
export const DOCUMENT_CATEGORY_QUERY_KEY = ["document-category"] as const;

/** Memetakan dokumen halaman ini ke item tampilan, termasuk tag dan kategori per dokumen. */
export function useRecentDocumentItems(
  documents: readonly RecentDocument[],
  selectedIds: ReadonlySet<string>,
): RecentDocumentItem[] {
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

  return documents.map((doc, index) => {
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
      isSelected: selectedIds.has(doc.id),
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
}
