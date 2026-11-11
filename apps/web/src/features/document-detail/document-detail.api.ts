import type { DocumentDetail, PreviewDocumentResponse } from "@axentra/shared";
import { documentDetailSchema, previewDocumentResponseSchema } from "@axentra/shared";
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

// Unduhan memakai mode stream: byte berkas lewat API di origin yang sama, lalu dibungkus
// blob URL. Signed URL storage tidak dipakai karena endpoint storage bisa berupa alamat
// internal (misalnya MinIO di localhost) yang tidak dapat dijangkau browser.
export function getDocumentDownloadFile(documentId: string): Promise<Blob> {
  return apiDownloadRequest(`/documents/${documentId}/download?stream=true`);
}
