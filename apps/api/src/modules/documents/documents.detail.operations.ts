import type { AuthUser, CategorySummary, DocumentDetail } from "@axentra/shared";
import { NotFoundError } from "../../http/errors";
import type { IDocumentCategoryRepository } from "./category.repository";
import type { IDocumentDetailRepository } from "./documents.detail.repository";
import type { IDocumentMetadataRepository } from "./metadata.repository";
import type { IDocumentSmartTagsRepository } from "./smart-tags.repository";

export type DocumentDetailDependencies = {
  repository: Pick<IDocumentDetailRepository, "findDocumentDetail">;
  metadataRepository: Pick<IDocumentMetadataRepository, "findMetadataByDocumentId">;
  smartTagsRepository: Pick<IDocumentSmartTagsRepository, "findSmartTagsByDocumentId">;
  categoryRepository: Pick<IDocumentCategoryRepository, "findCategoryByDocumentId">;
};

// Member Team may download only from a category whose permission is enabled (AC-13.01).
// Head of Team and Admin are not gated by the category permission.
export function resolveCanDownload(
  role: AuthUser["role"],
  category: CategorySummary | null,
): boolean {
  if (role !== "member_team") return true;
  return category !== null && category.downloadEnabled;
}

export async function readDocumentDetail(
  dependencies: DocumentDetailDependencies,
  documentId: string,
  role: AuthUser["role"],
): Promise<DocumentDetail> {
  const record = await dependencies.repository.findDocumentDetail(documentId);
  if (!record) {
    throw new NotFoundError("Dokumen tidak ditemukan");
  }

  const [category, tags, metadata] = await Promise.all([
    dependencies.categoryRepository.findCategoryByDocumentId(documentId),
    dependencies.smartTagsRepository.findSmartTagsByDocumentId(documentId),
    dependencies.metadataRepository.findMetadataByDocumentId(documentId),
  ]);

  return {
    id: record.document.id,
    title: record.document.title,
    processingStatus: record.document.processingStatus,
    category,
    tags: [...tags],
    file: {
      id: record.file.id,
      originalName: record.file.originalName,
      mimeType: record.file.mimeType,
      fileSize: record.file.fileSize,
      fileExtension: record.file.fileExtension,
      createdAt: record.file.createdAt.toISOString(),
    },
    metadata: metadata
      ? {
          author: metadata.author,
          extractedAt: metadata.extractedAt ? metadata.extractedAt.toISOString() : null,
        }
      : null,
    errorMessage: record.document.errorMessage,
    canDownload: resolveCanDownload(role, category),
    createdAt: record.document.createdAt.toISOString(),
    updatedAt: record.document.updatedAt.toISOString(),
  };
}
