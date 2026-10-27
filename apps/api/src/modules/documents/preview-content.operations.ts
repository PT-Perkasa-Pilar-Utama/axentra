import type { Logger } from "@axentra/observability";
import type { StorageAdapter } from "@axentra/storage";
import { SUPPORTED_DOCUMENT_MIME_TYPES } from "@axentra/shared";
import { AppError, NotFoundError } from "../../http/errors";
import { assertPreviewAllowed, type PreviewFileRecord } from "./preview.operations";
import type { IPreviewRepository } from "./preview.repository";

export type PreviewContentOperationDependencies = {
  previewRepository: IPreviewRepository;
  storage: StorageAdapter;
  logger?: Logger | undefined;
};

export type ExecutePreviewContentInput = {
  documentId: string;
  requestId?: string | undefined;
  logger?: Logger | undefined;
};

export type PreviewContentOperationResult = {
  filename: string;
  mimeType: string;
  fileSize: number;
  bytes: Uint8Array;
};

const SERVABLE_MIME_TYPES: ReadonlySet<string> = new Set(SUPPORTED_DOCUMENT_MIME_TYPES);

// Logs carry identifiers and sizes only; the storage key and the storage error are never logged.
async function readPreviewBytes(
  dependencies: PreviewContentOperationDependencies,
  input: ExecutePreviewContentInput,
  file: PreviewFileRecord,
): Promise<Uint8Array> {
  const logger = input.logger ?? dependencies.logger;

  let bytes: Uint8Array;
  try {
    bytes = await dependencies.storage.getObject(file.storageKey);
  } catch {
    logger?.error(
      { documentId: input.documentId, requestId: input.requestId },
      "Gagal membaca berkas pratinjau dari storage",
    );
    throw new AppError("INTERNAL_ERROR", "Terjadi kesalahan pada server", 500);
  }

  if (bytes.byteLength !== file.fileSize) {
    logger?.error(
      {
        documentId: input.documentId,
        requestId: input.requestId,
        expectedBytes: file.fileSize,
        actualBytes: bytes.byteLength,
      },
      "Ukuran berkas tidak sesuai dengan metadata",
    );
    throw new AppError("INTERNAL_ERROR", "Terjadi kesalahan pada server", 500);
  }

  return bytes;
}

export async function executePreviewContentOperation(
  dependencies: PreviewContentOperationDependencies,
  input: ExecutePreviewContentInput,
): Promise<PreviewContentOperationResult> {
  const target = await dependencies.previewRepository.findPreviewTarget(input.documentId);
  const file = assertPreviewAllowed(target);

  // Only the types the upload accepts are served; the stored value is never taken from the request.
  if (!SERVABLE_MIME_TYPES.has(file.mimeType)) {
    throw new NotFoundError("File dokumen tidak ditemukan");
  }

  const bytes = await readPreviewBytes(dependencies, input, file);

  return {
    filename: file.originalName,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
    bytes,
  };
}
