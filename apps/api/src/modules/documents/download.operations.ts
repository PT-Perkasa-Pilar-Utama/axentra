import type { Logger } from "@axentra/observability";
import type { StorageAdapter } from "@axentra/storage";
import {
  DEFAULT_DOWNLOAD_TTL_SECONDS,
  DOWNLOAD_ACCESS_DENIED_MESSAGE,
  type AuthUser,
} from "@axentra/shared";
import { ForbiddenError, NotFoundError } from "../../http/errors";
import type { IDownloadRepository } from "./download.repository";

export type DownloadOperationDependencies = {
  downloadRepository: IDownloadRepository;
  storage: StorageAdapter;
  logger?: Logger | undefined;
};

export type ExecuteDownloadInput = {
  documentId: string;
  user: AuthUser;
  stream?: boolean | undefined;
  expiresInSeconds?: number | undefined;
};

export type DownloadOperationResult =
  | {
      kind: "url";
      downloadUrl: string;
      filename: string;
      mimeType: string;
      fileSize: number;
      expiresInSeconds: number;
    }
  | {
      kind: "stream";
      filename: string;
      mimeType: string;
      fileSize: number;
      bytes: Uint8Array;
    };

export async function executeDownloadOperation(
  dependencies: DownloadOperationDependencies,
  input: ExecuteDownloadInput,
): Promise<DownloadOperationResult> {
  const target = await dependencies.downloadRepository.findDownloadTarget(input.documentId);

  if (!target || target.document.deletedAt !== null) {
    throw new NotFoundError("Dokumen tidak ditemukan");
  }

  if (!target.file) {
    throw new NotFoundError("File dokumen tidak ditemukan");
  }

  // Enforce category download permission for member_team (AC-09.01, AC-13.01)
  if (input.user.role === "member_team") {
    if (!target.document.categoryId) {
      throw new ForbiddenError(DOWNLOAD_ACCESS_DENIED_MESSAGE);
    }
    if (!target.categoryPermission || !target.categoryPermission.downloadEnabled) {
      throw new ForbiddenError(DOWNLOAD_ACCESS_DENIED_MESSAGE);
    }
  }

  // Successful authorization: record audit event (AC-09.01, AC-12.01)
  try {
    await dependencies.downloadRepository.recordDownloadAuditEvent({
      userId: input.user.id,
      userName: input.user.name ?? input.user.email,
      userEmail: input.user.email,
      documentId: target.document.id,
      documentName: target.file.originalName,
      downloadedAt: new Date(),
    });
  } catch (error) {
    dependencies.logger?.error({
      message: "Gagal mencatat audit event download",
      documentId: target.document.id,
      userId: input.user.id,
      error,
    });
    throw error;
  }

  if (input.stream === true) {
    const bytes = await dependencies.storage.getObject(target.file.storageKey);
    return {
      kind: "stream",
      filename: target.file.originalName,
      mimeType: target.file.mimeType,
      fileSize: target.file.fileSize,
      bytes,
    };
  }

  const ttl = input.expiresInSeconds ?? DEFAULT_DOWNLOAD_TTL_SECONDS;
  const downloadUrl = await dependencies.storage.createDownloadUrl(target.file.storageKey, ttl);

  return {
    kind: "url",
    downloadUrl,
    filename: target.file.originalName,
    mimeType: target.file.mimeType,
    fileSize: target.file.fileSize,
    expiresInSeconds: ttl,
  };
}
