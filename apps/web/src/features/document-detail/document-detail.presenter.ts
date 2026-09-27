import { useQuery } from "@tanstack/react-query";
import type { DocumentMetadataResult } from "@axentra/shared";
import { getDocumentDetail } from "./document-detail.api";

export type DocumentDetailPresenter = {
  status: "loading" | "ready" | "error";
  document: DocumentMetadataResult | undefined;
  author: string | null;
  filename: string;
  uploadDate: string;
  retry: () => void;
};

export type DocumentDetailPresenterOptions = {
  fetchFn?: (id: string) => Promise<DocumentMetadataResult>;
};

export function useDocumentDetailPresenter(
  documentId: string,
  options?: DocumentDetailPresenterOptions,
): DocumentDetailPresenter {
  const fetchFn = options?.fetchFn ?? getDocumentDetail;

  const docQuery = useQuery({
    queryKey: ["document-detail", documentId],
    queryFn: () => fetchFn(documentId),
    enabled: Boolean(documentId),
    retry: 1,
  });

  let status: DocumentDetailPresenter["status"] = "ready";
  if (!documentId) {
    status = "error";
  } else if (docQuery.isPending) {
    status = "loading";
  } else if (docQuery.isError) {
    status = "error";
  }

  const doc = docQuery.data;

  return {
    status,
    document: doc,
    author: doc?.author?.trim() || null,
    filename: "Nama berkas belum tersedia",
    uploadDate: "Belum tersedia",
    retry: () => {
      void docQuery.refetch();
    },
  };
}
