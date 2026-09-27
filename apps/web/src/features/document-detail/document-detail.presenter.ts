import { useQuery } from "@tanstack/react-query";
import type { DocumentMetadataResult } from "@axentra/shared";
import { getDocumentDetail } from "./document-detail.api";
import { listRecentDocuments } from "../recent-documents/recent-documents.api";
import { RECENT_DOCUMENTS_QUERY_KEY } from "../recent-documents/recent-documents.presenter";

export type DocumentDetailPresenter = {
  status: "loading" | "ready" | "error";
  document: DocumentMetadataResult | undefined;
  author: string | null;
  filename: string;
  uploadDate: string;
  fileInfoMessage: string | null;
  retry: () => void;
};

export type DocumentDetailPresenterOptions = {
  fetchFn?: (id: string) => Promise<DocumentMetadataResult>;
};

function formatDisplayDate(isoString?: string): string {
  if (!isoString) return "Belum tersedia";
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return "Belum tersedia";
  return parsed.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

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

  const recentListQuery = useQuery({
    queryKey: [...RECENT_DOCUMENTS_QUERY_KEY, 100],
    queryFn: () => listRecentDocuments(1, 100),
    enabled: Boolean(documentId),
    staleTime: 60 * 1000,
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
  // ponytail: only the 100 most recent files; replace with GET /documents/:id when available.
  const matchedRecent = recentListQuery.data?.find((item) => item.id === documentId);

  let fileInfoMessage: string | null = null;
  if (recentListQuery.isError) {
    fileInfoMessage = "Nama berkas tidak dapat diverifikasi dari daftar terkini.";
  } else if (!recentListQuery.isPending && !matchedRecent) {
    fileInfoMessage = "Berkas belum ditemukan pada 100 dokumen terakhir.";
  }

  return {
    status,
    document: doc,
    author: doc?.author?.trim() || null,
    filename:
      matchedRecent?.filename ??
      (recentListQuery.isPending ? "Memuat nama berkas…" : "Nama berkas belum tersedia"),
    uploadDate: formatDisplayDate(matchedRecent?.createdAt),
    fileInfoMessage,
    retry: () => {
      void docQuery.refetch();
      void recentListQuery.refetch();
    },
  };
}
