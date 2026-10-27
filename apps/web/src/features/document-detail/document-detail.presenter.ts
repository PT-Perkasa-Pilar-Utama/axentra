import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DocumentDetail, PreviewDocumentResponse } from "@axentra/shared";
import { ApiClientError } from "../../lib/api-client";
import {
  getDocumentDetail,
  getDocumentPreview,
  getDocumentPreviewContent,
  getDocumentDownload,
} from "./document-detail.api";
import {
  deriveDocumentDetailFields,
  type DocumentDetailFields,
} from "./document-detail-fields.presenter";
import { usePreviewObjectUrl } from "./document-preview-object-url";

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
// Fragment tidak dikirim ke server dan tidak mengubah blob URL lokal.
const PDF_VIEWER_PARAMS = "toolbar=0&navpanes=0";

export function buildPdfPreviewSrc(objectUrl: string): string {
  try {
    const url = new URL(objectUrl);
    url.hash = PDF_VIEWER_PARAMS;
    return url.toString();
  } catch {
    return `${objectUrl.split("#")[0]}#${PDF_VIEWER_PARAMS}`;
  }
}

export type DocumentDetailPresenter = {
  status: "loading" | "ready" | "error";
  previewStatus: "loading" | "ready" | "error";
  previewView: PreviewView | null;
  previewFormatLabel: string | null;
  previewFrameSrc: string | null;
  downloadStatus: DownloadStatus;
  canDownload: boolean;
  document: DocumentDetail | undefined;
  preview: PreviewDocumentResponse | undefined;
  author: string | null;
  filename: string;
  fields: DocumentDetailFields | null;
  retry: () => void;
  retryPreview: () => void;
  handleDownload: () => Promise<void>;
};

export type DocumentDetailPresenterOptions = {
  fetchFn?: (id: string) => Promise<DocumentDetail>;
  previewFetchFn?: (id: string) => Promise<PreviewDocumentResponse>;
  previewContentFetchFn?: (id: string) => Promise<Blob>;
};

export function useDocumentDetailPresenter(
  documentId: string,
  options?: DocumentDetailPresenterOptions,
): DocumentDetailPresenter {
  const fetchFn = options?.fetchFn ?? getDocumentDetail;
  const previewFetchFn = options?.previewFetchFn ?? getDocumentPreview;
  const previewContentFetchFn = options?.previewContentFetchFn ?? getDocumentPreviewContent;

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

  const preview = previewQuery.data;
  const previewView: PreviewView | null = preview ? derivePreviewView(preview.mimeType) : null;
  const contentEnabled = Boolean(documentId) && previewView === "pdf";

  // Hanya PDF yang dirender inline, sehingga byte DOCX tidak diminta. Blob tidak disimpan di cache
  // setelah komponen unmount; staleTime Infinity mencegah iframe dimuat ulang saat fokus jendela berubah.
  const contentQuery = useQuery({
    queryKey: ["document-preview-content", documentId],
    queryFn: () => previewContentFetchFn(documentId),
    enabled: contentEnabled,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const previewObjectUrl = usePreviewObjectUrl(contentQuery.data);

  // Hanya nilai true dari server yang mengizinkan unduhan; nilai hilang diperlakukan ditolak.
  const canDownload = docQuery.data?.canDownload === true;

  const handleDownload = useCallback(async () => {
    if (!documentId || !canDownload) return;
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
  }, [documentId, canDownload, clearResetTimer]);

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
  } else if (previewQuery.isError || (contentEnabled && contentQuery.isError)) {
    previewStatus = "error";
  } else if (contentEnabled && previewObjectUrl === null) {
    previewStatus = "loading";
  }

  const doc = docQuery.data;

  return {
    status,
    previewStatus,
    previewView,
    previewFormatLabel: preview ? formatMimeLabel(preview.mimeType) : null,
    previewFrameSrc:
      contentEnabled && previewObjectUrl !== null ? buildPdfPreviewSrc(previewObjectUrl) : null,
    downloadStatus,
    canDownload,
    document: doc,
    preview,
    author: doc?.metadata?.author?.trim() || null,
    filename: preview?.filename ?? "Nama berkas belum tersedia",
    fields: doc ? deriveDocumentDetailFields(doc) : null,
    retry: () => {
      void docQuery.refetch();
    },
    retryPreview: () => {
      if (previewQuery.isError) {
        void previewQuery.refetch();
      } else {
        void contentQuery.refetch();
      }
    },
    handleDownload,
  };
}
