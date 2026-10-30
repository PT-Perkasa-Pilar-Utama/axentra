import type { DocumentUploadAcceptedData } from "@axentra/shared";
import { documentUploadAcceptedDataSchema } from "@axentra/shared";
import { apiRequest, FILE_TRANSFER_TIMEOUT_MS } from "../../lib/api-client";

export async function uploadDocuments(files: File[]): Promise<DocumentUploadAcceptedData> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  return apiRequest(
    "/documents/upload",
    documentUploadAcceptedDataSchema,
    {
      method: "POST",
      body: formData,
    },
    { timeoutMs: FILE_TRANSFER_TIMEOUT_MS },
  );
}

export async function uploadDocument(file: File): Promise<DocumentUploadAcceptedData> {
  return uploadDocuments([file]);
}
