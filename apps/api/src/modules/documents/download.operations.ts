import type { Logger } from "@axentra/observability";
import { summarizeError } from "@axentra/observability";
import type { StorageAdapter } from "@axentra/storage";
import {
  DEFAULT_DOWNLOAD_TTL_SECONDS,
  DOWNLOAD_ACCESS_DENIED_MESSAGE,
  type AuthUser,
} from "@axentra/shared";
import { AppError, ForbiddenError, NotFoundError } from "../../http/errors";
import type {
  DownloadTargetRecord,
  DownloadWriteScope,
  IDownloadRepository,
} from "./download.repository";

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

type DownloadableFile = NonNullable<DownloadTargetRecord["file"]>;

type DownloadContent = { kind: "url"; downloadUrl: string } | { kind: "stream"; bytes: Uint8Array };

// Used by the pre-check and by the re-check under lock, so both apply exactly the same rules.
function assertDownloadAllowed(
  target: DownloadTargetRecord | null,
  user: AuthUser,
): DownloadableFile {
  if (!target || target.document.deletedAt !== null) {
    throw new NotFoundError("Dokumen tidak ditemukan");
  }

  if (!target.file) {
    throw new NotFoundError("File dokumen tidak ditemukan");
  }

  // Enforce category download permission for member_team (AC-09.01, AC-13.01)
  if (user.role === "member_team") {
    if (!target.document.categoryId) {
      throw new ForbiddenError(DOWNLOAD_ACCESS_DENIED_MESSAGE);
    }
    if (!target.categoryPermission?.downloadEnabled) {
      throw new ForbiddenError(DOWNLOAD_ACCESS_DENIED_MESSAGE);
    }
  }

  return target.file;
}

async function recordDownloadAudit(
  scope: DownloadWriteScope,
  logger: Logger | undefined,
  input: ExecuteDownloadInput,
  documentName: string,
): Promise<void> {
  try {
    await scope.recordDownloadAuditEvent({
      userId: input.user.id,
      userName: input.user.name ?? input.user.email,
      userEmail: input.user.email,
      documentId: input.documentId,
      documentName,
      downloadedAt: new Date(),
    });
  } catch (error) {
    logger?.error(
      {
        documentId: input.documentId,
        userId: input.user.id,
        error: summarizeError(error),
      },
      "Gagal mencatat audit event download",
    );
    // The database error carries the bound audit values (user, document, timestamp) in its params.
    // Replace it with the generic server error so the global error logger never receives them.
    throw new AppError("INTERNAL_ERROR", "Terjadi kesalahan pada server", 500);
  }
}

export async function executeDownloadOperation(
  dependencies: DownloadOperationDependencies,
  input: ExecuteDownloadInput,
): Promise<DownloadOperationResult> {
  const target = await dependencies.downloadRepository.findDownloadTarget(input.documentId);
  const file = assertDownloadAllowed(target, input.user);
  const ttl = input.expiresInSeconds ?? DEFAULT_DOWNLOAD_TTL_SECONDS;

  // Storage I/O stays outside the transaction, so no database connection is held while bytes are read.
  const content: DownloadContent =
    input.stream === true
      ? { kind: "stream", bytes: await dependencies.storage.getObject(file.storageKey) }
      : {
          kind: "url",
          downloadUrl: await dependencies.storage.createDownloadUrl(file.storageKey, ttl),
        };

  // Authorization is re-checked under row locks, and the audit row commits in the same transaction.
  // If the permission was revoked while storage was prepared, or the audit insert fails, this throws
  // and the content prepared above is discarded before any response is produced.
  await dependencies.downloadRepository.runInDownloadTransaction(async (scope) => {
    const locked = await scope.lockDownloadTarget(input.documentId);
    assertDownloadAllowed(locked, input.user);
    await recordDownloadAudit(scope, dependencies.logger, input, file.originalName);
  });

  if (content.kind === "stream") {
    return {
      kind: "stream",
      filename: file.originalName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      bytes: content.bytes,
    };
  }

  return {
    kind: "url",
    downloadUrl: content.downloadUrl,
    filename: file.originalName,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
    expiresInSeconds: ttl,
  };
}
