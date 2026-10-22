import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DocumentMetadataResult, PreviewDocumentResponse } from "@axentra/shared";
import { getDocumentDetail, getDocumentPreview, getDocumentDownload } from "./document-detail.api";

export type DownloadStatus = "idle" | "loading" | "success" | "denied" | "expired" | "error";

export type DocumentDetailPresenter = {
  status: "loading" | "ready" | "error";
  previewStatus: "loading" | "ready" | "error";
  downloadStatus: DownloadStatus;
  document: DocumentMetadataResult | undefined;
  preview: PreviewDocumentResponse | undefined;
  author: string | null;
  filename: string;
  uploadDate: string;
  retry: () => void;
  retryPreview: () => void;
  handleDownload: () => Promise<void>;
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

  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>("idle");

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

  const handleDownload = useCallback(async () => {
    if (!documentId) return;
    setDownloadStatus("loading");

    try {
      const { downloadUrl } = await getDocumentDownload(documentId);
      setDownloadStatus("success");

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", "");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => setDownloadStatus("idle"), 3000);
    } catch (error: unknown) {
      const err = error as {
        message?: string;
        code?: string;
        status?: number;
        response?: { status?: number };
      };
      const errorMessage = String(err.message || err.code || "").toLowerCase();
      const statusCode = err.response?.status || err.status;
      if (
        statusCode === 403 ||
        errorMessage.includes("denied") ||
        errorMessage.includes("forbidden") ||
        errorMessage.includes("dilarang")
      ) {
        setDownloadStatus("denied");
      } else if (
        statusCode === 410 ||
        errorMessage.includes("expired") ||
        errorMessage.includes("kadaluarsa")
      ) {
        setDownloadStatus("expired");
      } else {
        setDownloadStatus("error");
      }
    }
  }, [documentId]);

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
    downloadStatus,
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
    handleDownload,
  };
}
