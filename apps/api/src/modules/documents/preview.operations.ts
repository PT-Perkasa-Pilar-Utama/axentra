import type { StorageAdapter } from "@axentra/storage";
import { PREVIEW_URL_TTL_SECONDS } from "@axentra/shared";
import { NotFoundError } from "../../http/errors";
import type { IPreviewRepository } from "./preview.repository";

export type PreviewOperationDependencies = {
  previewRepository: IPreviewRepository;
  storage: StorageAdapter;
};

export type ExecutePreviewInput = {
  documentId: string;
};

export type PreviewOperationResult = {
  previewUrl: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  expiresInSeconds: number;
};

export async function executePreviewOperation(
  dependencies: PreviewOperationDependencies,
  input: ExecutePreviewInput,
): Promise<PreviewOperationResult> {
  const target = await dependencies.previewRepository.findPreviewTarget(input.documentId);

  if (!target || target.document.deletedAt !== null) {
    throw new NotFoundError("Dokumen tidak ditemukan");
  }

  if (!target.file) {
    throw new NotFoundError("File dokumen tidak ditemukan");
  }

  const previewUrl = await dependencies.storage.createDownloadUrl(
    target.file.storageKey,
    PREVIEW_URL_TTL_SECONDS,
  );

  return {
    previewUrl,
    filename: target.file.originalName,
    mimeType: target.file.mimeType,
    fileSize: target.file.fileSize,
    expiresInSeconds: PREVIEW_URL_TTL_SECONDS,
  };
}
