import { NotFoundError } from "../../http/errors";
import type { IPreviewRepository, PreviewTargetRecord } from "./preview.repository";

export type PreviewOperationDependencies = {
  previewRepository: IPreviewRepository;
};

export type ExecutePreviewInput = {
  documentId: string;
};

export type PreviewOperationResult = {
  filename: string;
  mimeType: string;
  fileSize: number;
};

export type PreviewFileRecord = NonNullable<PreviewTargetRecord["file"]>;

// Shared by the metadata and content routes so both apply the same deletedAt and file rules.
export function assertPreviewAllowed(target: PreviewTargetRecord | null): PreviewFileRecord {
  if (!target || target.document.deletedAt !== null) {
    throw new NotFoundError("Dokumen tidak ditemukan");
  }

  if (!target.file) {
    throw new NotFoundError("File dokumen tidak ditemukan");
  }

  return target.file;
}

export async function executePreviewOperation(
  dependencies: PreviewOperationDependencies,
  input: ExecutePreviewInput,
): Promise<PreviewOperationResult> {
  const target = await dependencies.previewRepository.findPreviewTarget(input.documentId);
  const file = assertPreviewAllowed(target);

  return {
    filename: file.originalName,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
  };
}
