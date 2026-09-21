import { useQuery } from "@tanstack/react-query";
import type { DocumentMetadataResult } from "@axentra/shared";
import { getDocumentDetail } from "./document-detail.api";

export type DocumentDetailPresenter = {
  status: "loading" | "ready" | "error";
  document: DocumentMetadataResult | undefined;
  author: string | null;
  filename: string;
  category: string | null;
  tags: string[];
  uploadDate: string | undefined;
  processingStatus: "completed" | "processing" | "queued" | "failed";
  isProcessed: boolean;
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
  const processingStatus = doc?.extractedAt ? "completed" : "processing";

  return {
    status,
    document: doc,
    author: doc?.author ?? null,
    filename: (doc?.rawMetadata?.filename as string) ?? "Dokumen",
    category: (doc?.rawMetadata?.category as string) ?? null,
    tags: Array.isArray(doc?.rawMetadata?.tags) ? (doc.rawMetadata.tags as string[]) : [],
    uploadDate: doc?.extractedAt ?? doc?.createdAt,
    processingStatus,
    isProcessed: Boolean(doc?.extractedAt || doc?.author),
    retry: () => void query.refetch(),
  };
}
