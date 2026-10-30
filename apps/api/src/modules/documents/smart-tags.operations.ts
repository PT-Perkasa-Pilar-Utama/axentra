import type { SmartTag } from "@axentra/shared";
import { NotFoundError } from "../../http/errors";
import type { IDocumentSmartTagsRepository } from "./smart-tags.repository";

export async function readDocumentSmartTags(
  smartTagsRepository: IDocumentSmartTagsRepository,
  documentId: string,
): Promise<ReadonlyArray<SmartTag>> {
  const document = await smartTagsRepository.findDocumentById(documentId);
  if (!document) {
    throw new NotFoundError("Dokumen tidak ditemukan");
  }

  return await smartTagsRepository.findSmartTagsByDocumentId(documentId);
}

export async function storeDocumentSmartTags(
  smartTagsRepository: IDocumentSmartTagsRepository,
  documentId: string,
  tags: ReadonlyArray<string>,
): Promise<ReadonlyArray<SmartTag>> {
  const document = await smartTagsRepository.findDocumentById(documentId);
  if (!document) {
    throw new NotFoundError("Dokumen tidak ditemukan");
  }

  return await smartTagsRepository.saveDocumentSmartTags(documentId, tags);
}
