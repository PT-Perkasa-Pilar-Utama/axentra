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
import {
  deriveDownloadControlState,
  type DownloadControlState,
  type DownloadStatus,
} from "./document-detail-download.presenter";
import { deriveDocxPreviewState, type DocxPreviewState } from "./document-docx-preview.presenter";
import { readDocxText, type DocxPreviewText } from "./docx-text";

export type PreviewView = "pdf" | "docx" | "unsupported";

const SUCCESS_RESET_MS = 3000;

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const MIME_LABELS: Readonly<Record<string, string>> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  [DOCX_MIME_TYPE]: "DOCX",
};

export function derivePreviewView(mimeType: string): PreviewView {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === DOCX_MIME_TYPE) return "docx";
  return "unsupported";
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
  downloadControl: DownloadControlState;
  /** Teks DOCX hanya terisi saat previewView "docx"; null untuk format lain. */
  docxPreview: DocxPreviewState | null;
  canDownload: boolean;
  document: DocumentDetail | undefined;
  preview: PreviewDocumentResponse | undefined;
  filename: string;
  fields: DocumentDetailFields | null;
  retry: () => void;
  retryPreview: () => void;
  retryDocxPreview: () => void;
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

  // PDF dirender inline dari blob URL. Blob tidak disimpan di cache setelah komponen unmount;
  // staleTime Infinity mencegah iframe dimuat ulang saat fokus jendela berubah.
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

  // DOCX memakai endpoint byte yang sama, lalu hanya teks paragraf yang disimpan di cache.
  const docxEnabled = Boolean(documentId) && previewView === "docx";
  const docxQuery = useQuery({
    queryKey: ["document-preview-docx", documentId],
    queryFn: async (): Promise<DocxPreviewText> =>
      readDocxText(await previewContentFetchFn(documentId)),
    enabled: docxEnabled,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

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
    docxPreview: docxEnabled ? deriveDocxPreviewState(docxQuery) : null,
    downloadStatus,
    downloadControl: deriveDownloadControlState(downloadStatus, canDownload),
    canDownload,
    document: doc,
    preview,
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
    retryDocxPreview: () => {
      void docxQuery.refetch();
    },
    handleDownload,
  };
}
