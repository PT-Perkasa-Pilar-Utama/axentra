import type { DocumentMetadataResult } from "@axentra/shared";
import { NotFoundError } from "../../http/errors";
import { formatMetadataResult } from "./documents.service.helpers";
import type { IMetadataExtractor } from "./metadata.extractor";
import type { IDocumentMetadataRepository, SaveMetadataInput } from "./metadata.repository";

export type ExtractMetadataOptions = {
  filename?: string | undefined;
  mimeType?: string | undefined;
  buffer?: Uint8Array | Buffer | undefined;
  rawText?: string | undefined;
};

export async function readStoredMetadata(
  metadataRepository: IDocumentMetadataRepository,
  documentId: string,
): Promise<DocumentMetadataResult> {
  const document = await metadataRepository.findDocumentById(documentId);
  if (!document) {
    throw new NotFoundError("Dokumen tidak ditemukan");
  }

  const metadata = await metadataRepository.findMetadataByDocumentId(documentId);
  if (!metadata) {
    throw new NotFoundError("Metadata dokumen tidak ditemukan");
  }

  return formatMetadataResult(metadata);
}

export async function extractAndStoreMetadata(
  metadataRepository: IDocumentMetadataRepository,
  metadataExtractor: IMetadataExtractor,
  documentId: string,
  options?: ExtractMetadataOptions | undefined,
): Promise<DocumentMetadataResult> {
  const document = await metadataRepository.findDocumentById(documentId);
  if (!document) {
    throw new NotFoundError("Dokumen tidak ditemukan");
  }

  const extracted = await metadataExtractor.extract({
    documentId,
    filename: options?.filename ?? document.title,
    mimeType: options?.mimeType,
    buffer: options?.buffer,
    rawText: options?.rawText,
  });

  const saved = await metadataRepository.saveMetadata({
    documentId,
    author: extracted.author,
    rawMetadata: extracted.rawMetadata,
    extractedAt: extracted.extractedAt,
  });

  return formatMetadataResult(saved);
}

export async function storeProvidedMetadata(
  metadataRepository: IDocumentMetadataRepository,
  data: SaveMetadataInput,
): Promise<DocumentMetadataResult> {
  const document = await metadataRepository.findDocumentById(data.documentId);
  if (!document) {
    throw new NotFoundError("Dokumen tidak ditemukan");
  }

  const saved = await metadataRepository.saveMetadata(data);
  return formatMetadataResult(saved);
}
