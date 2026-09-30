import { useQuery } from "@tanstack/react-query";
import type { RelatedDocument } from "@axentra/shared";
import { getRelatedDocuments } from "./related-documents.api";

export type RelatedDocumentItem = {
  id: string;
  filename: string;
  sharedTags: string[];
  href: string;
};

export type RelatedDocumentsPresenter = {
  status: "loading" | "ready" | "empty" | "error";
  items: RelatedDocumentItem[];
  retry: () => void;
};

function toRelatedDocumentItem(document: RelatedDocument): RelatedDocumentItem {
  return {
    id: document.id,
    filename: document.filename,
    sharedTags: [...new Set(document.sharedTags)].slice(0, 3),
    href: `/documents/${document.id}`,
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

  const items = (query.data ?? [])
    .filter((document) => document.id !== documentId)
    .map(toRelatedDocumentItem);

  if (items.length === 0) {
    return { status: "empty", items: [], retry };
  }

  return { status: "ready", items, retry };
}
