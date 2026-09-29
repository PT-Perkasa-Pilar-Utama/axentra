import { useQuery } from "@tanstack/react-query";
import type { DocumentSummary } from "@axentra/shared";
import { getRelatedDocuments } from "./related-documents.api";

export type RelatedDocumentItem = {
  id: string;
  title: string;
  tags: string[];
  href: string;
};

export type RelatedDocumentsPresenter = {
  status: "loading" | "ready" | "empty" | "error";
  items: RelatedDocumentItem[];
  retry: () => void;
};

function toRelatedDocumentItem(summary: DocumentSummary): RelatedDocumentItem {
  return {
    id: summary.id,
    title: summary.title,
    tags: [...new Set((summary.tags ?? []).map((tag) => tag.name))].slice(0, 3),
    href: `/documents/${summary.id}`,
  };
}

export function useRelatedDocumentsPresenter(documentId: string): RelatedDocumentsPresenter {
  const query = useQuery({
    queryKey: ["document-related", documentId],
    queryFn: ({ signal }) => getRelatedDocuments(documentId, signal),
    enabled: Boolean(documentId),
    retry: false,
  });

  const retry = (): void => {
    void query.refetch();
  };

  if (!documentId) {
    return { status: "error", items: [], retry };
  }

  if (query.isPending) {
    return { status: "loading", items: [], retry };
  }

  if (query.isError) {
    return { status: "error", items: [], retry };
  }

  // Tag overlap is guaranteed by BE-S2-06, not inferred from the recent-document list.
  const items = (query.data ?? [])
    .filter((document) => document.id !== documentId && document.tags?.length)
    .map(toRelatedDocumentItem);

  if (items.length === 0) {
    return { status: "empty", items: [], retry };
  }

  return { status: "ready", items, retry };
}
