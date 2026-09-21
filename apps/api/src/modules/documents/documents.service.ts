import type { DocumentMetadataResult, DocumentUploadAcceptedData } from "@axentra/shared";
import { DOCUMENT_COPY } from "@axentra/shared";
import { NotFoundError } from "../../http/errors";
import type { RawUploadFile, ValidatedDocumentFile } from "./documents.schema";
import { validateUploadBatchConstraints } from "./documents.schema";
import type { IMetadataExtractor } from "./metadata.extractor";
import { DeterministicMetadataExtractor } from "./metadata.extractor";
import type {
  DocumentMetadataRecord,
  IDocumentMetadataRepository,
  SaveMetadataInput,
} from "./metadata.repository";
import { InMemoryDocumentMetadataRepository } from "./metadata.repository";

export type ExtractMetadataOptions = {
  filename?: string | undefined;
  mimeType?: string | undefined;
  buffer?: Uint8Array | Buffer | undefined;
  rawText?: string | undefined;
};

export type DocumentService = {
  validateUpload: (files: ReadonlyArray<RawUploadFile>) => Promise<DocumentUploadAcceptedData>;
  getDocumentMetadata: (documentId: string) => Promise<DocumentMetadataResult>;
  extractAndStoreMetadata: (
    documentId: string,
    options?: ExtractMetadataOptions | undefined,
  ) => Promise<DocumentMetadataResult>;
  storeMetadata: (data: SaveMetadataInput) => Promise<DocumentMetadataResult>;
};

export type DocumentServiceDependencies = {
  metadataRepository?: IDocumentMetadataRepository | undefined;
  metadataExtractor?: IMetadataExtractor | undefined;
};

function formatMetadataResult(record: DocumentMetadataRecord): DocumentMetadataResult {
  return {
    id: record.id,
    documentId: record.documentId,
    author: record.author,
    rawMetadata: record.rawMetadata,
    extractedAt: record.extractedAt ? record.extractedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function createDocumentService(
  dependencies: DocumentServiceDependencies = {},
): DocumentService {
  const repository = dependencies.metadataRepository ?? new InMemoryDocumentMetadataRepository();
  const extractor = dependencies.metadataExtractor ?? new DeterministicMetadataExtractor();

  return {
    async validateUpload(files: ReadonlyArray<RawUploadFile>): Promise<DocumentUploadAcceptedData> {
      const validated = validateUploadBatchConstraints(files);
      return {
        message: DOCUMENT_COPY.UPLOAD_ACCEPTED,
        count: validated.length,
        files: validated.map((f: ValidatedDocumentFile) => ({
          filename: f.filename,
          size: f.size,
          documentType: f.documentType,
        })),
      };
    },

    async getDocumentMetadata(documentId: string): Promise<DocumentMetadataResult> {
      const document = await repository.findDocumentById(documentId);
      if (!document) {
        throw new NotFoundError("Dokumen tidak ditemukan");
      }

      const metadata = await repository.findMetadataByDocumentId(documentId);
      if (!metadata) {
        throw new NotFoundError("Metadata dokumen tidak ditemukan");
      }

      return formatMetadataResult(metadata);
    },

    async extractAndStoreMetadata(
      documentId: string,
      options?: ExtractMetadataOptions | undefined,
    ): Promise<DocumentMetadataResult> {
      const document = await repository.findDocumentById(documentId);
      if (!document) {
        throw new NotFoundError("Dokumen tidak ditemukan");
      }

      const extracted = await extractor.extract({
        documentId,
        filename: options?.filename ?? document.title,
        mimeType: options?.mimeType,
        buffer: options?.buffer,
        rawText: options?.rawText,
      });

      const saved = await repository.saveMetadata({
        documentId,
        author: extracted.author,
        rawMetadata: extracted.rawMetadata,
        extractedAt: extracted.extractedAt,
      });

      return formatMetadataResult(saved);
    },

    async storeMetadata(data: SaveMetadataInput): Promise<DocumentMetadataResult> {
      const document = await repository.findDocumentById(data.documentId);
      if (!document) {
        throw new NotFoundError("Dokumen tidak ditemukan");
      }

      const saved = await repository.saveMetadata(data);
      return formatMetadataResult(saved);
    },
  };
}
