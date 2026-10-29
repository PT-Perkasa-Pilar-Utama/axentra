import type { DocumentDetail } from "@axentra/shared";
import { formatDate } from "../recent-documents/recent-documents.format";

// Batas tag yang tampil di halaman detail (AC-04.02).
export const DETAIL_TAGS_LIMIT = 3;

export type DetailAuthorField = {
  label: string;
  /** false bila metadata penulis tidak terdeteksi; view memakai gaya teks redup. */
  isDetected: boolean;
};

export type DetailTagsField = {
  status: "ready" | "empty";
  names: string[];
};

export type DetailCategoryField = {
  status: "ready" | "empty";
  name: string | null;
};

export type DetailUploadDateField = {
  label: string;
};

export type DocumentDetailFields = {
  author: DetailAuthorField;
  tags: DetailTagsField;
  category: DetailCategoryField;
  uploadDate: DetailUploadDateField;
  /** Dokumen Terkait hanya untuk dokumen yang memiliki minimal satu tag (AC-07.01). */
  showRelated: boolean;
};

// Semua kolom metadata berasal dari satu respons GET /documents/:id.
export function deriveDocumentDetailFields(detail: DocumentDetail): DocumentDetailFields {
  const names = (detail.tags ?? []).slice(0, DETAIL_TAGS_LIMIT).map((tag) => tag.name);
  const categoryName = detail.category?.name ?? null;
  const author = detail.metadata?.author?.trim() || null;
  const tags: DetailTagsField = { status: names.length > 0 ? "ready" : "empty", names };

  return {
    author: { label: author ?? "Tidak terdeteksi", isDetected: author !== null },
    tags,
    category: {
      status: categoryName !== null ? "ready" : "empty",
      name: categoryName,
    },
    uploadDate: { label: formatDate(detail.createdAt) },
    showRelated: tags.status === "ready",
  };
}
