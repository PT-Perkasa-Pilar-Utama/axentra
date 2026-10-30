import type { CategorySummary } from "@axentra/shared";
import { NotFoundError } from "../../http/errors";
import type { IDocumentCategoryRepository } from "./category.repository";

export async function readDocumentCategory(
  categoryRepository: IDocumentCategoryRepository,
  documentId: string,
): Promise<CategorySummary | null> {
  const document = await categoryRepository.findDocumentById(documentId);
  if (!document || document.deletedAt) {
    throw new NotFoundError("Dokumen tidak ditemukan");
  }

  return await categoryRepository.findCategoryByDocumentId(documentId);
}
