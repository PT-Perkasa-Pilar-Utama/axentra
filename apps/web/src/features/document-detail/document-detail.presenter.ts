import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DocumentMetadataResult, PreviewDocumentResponse } from "@axentra/shared";
import { ApiClientError } from "../../lib/api-client";
import { getDocumentDetail, getDocumentPreview, getDocumentDownload } from "./document-detail.api";

export type DownloadStatus = "idle" | "loading" | "success" | "denied" | "error";
export type PreviewView = "pdf" | "unsupported";

const SUCCESS_RESET_MS = 3000;

const MIME_LABELS: Readonly<Record<string, string>> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
};

export function derivePreviewView(mimeType: string): PreviewView {
  return mimeType === "application/pdf" ? "pdf" : "unsupported";
}

export function formatMimeLabel(mimeType: string): string {
  return MIME_LABELS[mimeType] ?? "tidak dikenal";
}

export function isSafeDownloadUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// Menyembunyikan toolbar bawaan viewer PDF (termasuk tombol simpan) di area preview.
// Fragment tidak dikirim ke server, jadi tidak memengaruhi tanda tangan presigned URL.
const PDF_VIEWER_PARAMS = "toolbar=0&navpanes=0";

export function buildPdfPreviewSrc(previewUrl: string): string {
  try {
    const url = new URL(previewUrl);
    url.hash = PDF_VIEWER_PARAMS;
    return url.toString();
  } catch {
    return `${previewUrl.split("#")[0]}#${PDF_VIEWER_PARAMS}`;
  }
}

export type DocumentDetailPresenter = {
  status: "loading" | "ready" | "error";
  previewStatus: "loading" | "ready" | "error";
  previewView: PreviewView | null;
  previewFormatLabel: string | null;
  previewFrameSrc: string | null;
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
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearResetTimer, [clearResetTimer]);

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
    clearResetTimer();
    setDownloadStatus("loading");

    try {
      const { downloadUrl } = await getDocumentDownload(documentId);
      if (!isSafeDownloadUrl(downloadUrl)) {
        setDownloadStatus("error");
        return;
      }

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", "");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDownloadStatus("success");
      resetTimerRef.current = setTimeout(() => {
        resetTimerRef.current = null;
        setDownloadStatus("idle");
      }, SUCCESS_RESET_MS);
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 403) {
        setDownloadStatus("denied");
      } else {
        setDownloadStatus("error");
      }
    }
  }, [documentId, clearResetTimer]);

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
    previewView: preview ? derivePreviewView(preview.mimeType) : null,
    previewFormatLabel: preview ? formatMimeLabel(preview.mimeType) : null,
    previewFrameSrc:
      preview && derivePreviewView(preview.mimeType) === "pdf"
        ? buildPdfPreviewSrc(preview.previewUrl)
        : null,
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
