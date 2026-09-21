import { useQuery } from "@tanstack/react-query";
import type { DocumentDetail } from "@axentra/shared";
import { getDocumentDetail } from "./document-detail.api";

export type DocumentDetailPresenter = {
  status: "loading" | "ready" | "error";
  document: DocumentDetail | undefined;
  author: string | null;
  filename: string;
  category: string | null;
  tags: string[];
  uploadDate: string | undefined;
  isProcessed: boolean;
  retry: () => void;
};

export type DocumentDetailPresenterOptions = {
  fetchFn?: (id: string) => Promise<DocumentDetail>;
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
    author: doc?.metadata?.author ?? null,
    filename: doc?.file?.originalName ?? doc?.title ?? "",
    category: doc?.category?.name ?? null,
    tags: doc?.tags?.map((tag) => tag.name) ?? [],
    uploadDate: doc?.createdAt,
    isProcessed: doc?.processingStatus === "completed",
    retry: () => void query.refetch(),
  };
}
