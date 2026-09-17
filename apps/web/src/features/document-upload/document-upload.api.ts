import type { UploadDocumentResponse } from "@axentra/shared";
import { uploadDocumentResponseSchema } from "@axentra/shared";
import { apiRequest } from "../../lib/api-client";

export async function uploadDocument(file: File): Promise<UploadDocumentResponse> {
  const formData = new FormData();
  formData.append("file", file);

  return apiRequest("/api/v1/documents/upload", uploadDocumentResponseSchema, {
    method: "POST",
    body: formData,
  });
}

export async function uploadDocuments(files: File[]): Promise<UploadDocumentResponse[]> {
  return Promise.all(files.map((file) => uploadDocument(file)));
}
