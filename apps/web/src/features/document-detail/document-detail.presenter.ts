import { useQuery } from "@tanstack/react-query";
import type { DocumentMetadata } from "@axentra/shared";
import { getDocumentDetail } from "./document-detail.api";

export type DocumentDetailPresenter = {
  status: "loading" | "ready" | "error";
  document: DocumentMetadata | undefined;
  author: string | null;
  filename: string;
  category: string | null;
  tags: string[];
  uploadDate: string | undefined;
  isProcessed: boolean;
  retry: () => void;
};

export type DocumentDetailPresenterOptions = {
  fetchFn?: (id: string) => Promise<DocumentMetadata>;
};

export function useDocumentDetailPresenter(
  documentId: string,
  options?: DocumentDetailPresenterOptions,
): DocumentDetailPresenter {
  const fetchFn = options?.fetchFn ?? getDocumentDetail;

  const query = useQuery({
    queryKey: ["document-detail", documentId],
    queryFn: () => fetchFn(documentId),
    enabled: Boolean(documentId),
    retry: 1,
  });

  let status: DocumentDetailPresenter["status"] = "ready";
  if (!documentId) {
    status = "error";
  } else if (query.isPending) {
    status = "loading";
  } else if (query.isError) {
    status = "error";
  }

  const doc = query.data;

  return {
    status,
    document: doc,
    author: doc?.author ?? null,
    filename: doc?.filename ?? "",
    category: doc?.category ?? null,
    tags: doc?.tags ?? [],
    uploadDate: doc?.uploadDate,
    isProcessed: doc?.processingStatus === "processed",
    retry: () => void query.refetch(),
  };
}
