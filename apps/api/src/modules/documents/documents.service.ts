import type { DocumentUploadAcceptedData } from "@axentra/shared";
import { DOCUMENT_COPY } from "@axentra/shared";
import type { RawUploadFile, ValidatedDocumentFile } from "./documents.schema";
import { validateUploadBatchConstraints } from "./documents.schema";

export type DocumentService = {
  validateUpload: (files: ReadonlyArray<RawUploadFile>) => Promise<DocumentUploadAcceptedData>;
};

export function createDocumentService(): DocumentService {
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
  };
}
