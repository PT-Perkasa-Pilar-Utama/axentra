import { useQuery } from "@tanstack/react-query";
import type { DocumentMetadataResult, PreviewDocumentResponse } from "@axentra/shared";
import { getDocumentDetail, getDocumentPreview } from "./document-detail.api";

export type DocumentDetailPresenter = {
  status: "loading" | "ready" | "error";
  previewStatus: "loading" | "ready" | "error";
  document: DocumentMetadataResult | undefined;
  preview: PreviewDocumentResponse | undefined;
  author: string | null;
  filename: string;
  uploadDate: string;
  retry: () => void;
  retryPreview: () => void;
};

export type DocumentDetailPresenterOptions = {
  fetchFn?: (id: string) => Promise<DocumentMetadataResult>;
  previewFetchFn?: (id: string) => Promise<PreviewDocumentResponse>;
};

export function useDocumentDetailPresenter(
  documentId: string,
  options?: DocumentDetailPresenterOptions,
): DocumentDetailPresenter {
  const fetchFn = options?.fetchFn ?? getDocumentDetail;
  const previewFetchFn = options?.previewFetchFn ?? getDocumentPreview;

  const docQuery = useQuery({
    queryKey: ["document-detail", documentId],
    queryFn: () => fetchFn(documentId),
    enabled: Boolean(documentId),
    retry: 1,
  });

  const previewQuery = useQuery({
    queryKey: ["document-preview", documentId],
    queryFn: () => previewFetchFn(documentId),
    enabled: Boolean(documentId),
    retry: false,
  });

  let status: DocumentDetailPresenter["status"] = "ready";
  if (!documentId) {
    status = "error";
  } else if (docQuery.isPending) {
    status = "loading";
  } else if (docQuery.isError) {
    status = "error";
  }

  let previewStatus: DocumentDetailPresenter["previewStatus"] = "ready";
  if (!documentId || previewQuery.isPending) {
    previewStatus = "loading";
  } else if (previewQuery.isError) {
    previewStatus = "error";
  }

  const doc = docQuery.data;
  const preview = previewQuery.data;

  return {
    status,
    previewStatus,
    document: doc,
    preview,
    author: doc?.author?.trim() || null,
    filename: preview?.filename ?? "Nama berkas belum tersedia",
    uploadDate: "Belum tersedia",
    retry: () => {
      void docQuery.refetch();
    },
    retryPreview: () => {
      void previewQuery.refetch();
    },
  };
}
