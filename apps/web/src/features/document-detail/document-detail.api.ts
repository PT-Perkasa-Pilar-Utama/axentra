import type {
  DocumentDetail,
  DownloadDocumentResponse,
  PreviewDocumentResponse,
} from "@axentra/shared";
import {
  documentDetailSchema,
  downloadDocumentResponseSchema,
  previewDocumentResponseSchema,
} from "@axentra/shared";
import { apiDownloadRequest, apiRequest } from "../../lib/api-client";

// Satu sumber untuk penulis, tag, kategori, tanggal unggah, dan canDownload.
export function getDocumentDetail(documentId: string): Promise<DocumentDetail> {
  return apiRequest(`/documents/${documentId}`, documentDetailSchema);
}

// Metadata saja (filename, mimeType, fileSize); tidak ada URL penyimpanan dalam respons.
export function getDocumentPreview(documentId: string): Promise<PreviewDocumentResponse> {
  return apiRequest(`/documents/${documentId}/preview`, previewDocumentResponseSchema);
}

// Byte berkas dikirim lewat API dengan Bearer token, lalu dibungkus blob URL di presenter.
export function getDocumentPreviewContent(documentId: string): Promise<Blob> {
  return apiDownloadRequest(`/documents/${documentId}/preview/content`);
}

export function getDocumentDownload(documentId: string): Promise<DownloadDocumentResponse> {
  return apiRequest(`/documents/${documentId}/download`, downloadDocumentResponseSchema);
}
