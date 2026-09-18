import type { DocumentUploadAcceptedData } from "@axentra/shared";
import { documentUploadAcceptedDataSchema } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export async function uploadDocuments(files: File[]): Promise<DocumentUploadAcceptedData> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  return apiRequest("/documents/upload", documentUploadAcceptedDataSchema, {
    method: "POST",
    body: formData,
  });
}

export async function uploadDocument(file: File): Promise<DocumentUploadAcceptedData> {
  return uploadDocuments([file]);
}
