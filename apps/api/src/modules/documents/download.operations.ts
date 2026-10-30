import type { Logger } from "@axentra/observability";
import type { StorageAdapter } from "@axentra/storage";
import {
  DEFAULT_DOWNLOAD_TTL_SECONDS,
  DOWNLOAD_ACCESS_DENIED_MESSAGE,
  type AuthUser,
} from "@axentra/shared";
import { AppError, ForbiddenError, NotFoundError } from "../../http/errors";
import type {
  DocumentCategoryPermissionStatus,
  DownloadTargetRecord,
  IDownloadRepository,
} from "./download.repository";
import { runDownloadAuditTransaction } from "./download.audit-transaction";

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
  logger?: Logger | undefined;
  requestId?: string | undefined;
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

// Used by the pre-check, so a missing or unauthorized target never reaches storage.
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

// Used under the row lock, so a revoke or soft-delete committed during storage I/O is caught here.
function assertLockedDownloadAllowed(
  status: DocumentCategoryPermissionStatus | undefined,
  user: AuthUser,
): void {
  if (!status || status.deletedAt !== null) {
    throw new NotFoundError("Dokumen tidak ditemukan");
  }

  if (
    user.role === "member_team" &&
    (status.categoryId === null || status.downloadEnabled !== true)
  ) {
    throw new ForbiddenError(DOWNLOAD_ACCESS_DENIED_MESSAGE);
  }
}

// A short or long object would be served under a Content-Length taken from metadata, and its audit row
// would already be committed. Verifying the bytes here keeps a mismatch from reaching the audit write.
async function readVerifiedBytes(
  dependencies: DownloadOperationDependencies,
  input: ExecuteDownloadInput,
  file: DownloadableFile,
): Promise<Uint8Array> {
  const bytes = await dependencies.storage.getObject(file.storageKey);
  if (bytes.byteLength !== file.fileSize) {
    const logger = input.logger ?? dependencies.logger;
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
      ? { kind: "stream", bytes: await readVerifiedBytes(dependencies, input, file) }
      : {
          kind: "url",
          downloadUrl: await dependencies.storage.createDownloadUrl(file.storageKey, ttl, {
            downloadFilename: file.originalName,
          }),
        };

  // Authorization is re-checked under row locks, and the audit row commits in the same transaction.
  // If the permission was revoked while storage was prepared, or the audit insert fails, this throws
  // and the content prepared above is discarded before any response is produced.
  await runDownloadAuditTransaction(
    input.logger ?? dependencies.logger,
    "Gagal mencatat audit event download",
    { documentId: input.documentId, userId: input.user.id, requestId: input.requestId },
    () =>
      dependencies.downloadRepository.transaction(async (txRepo) => {
        const [locked] = await txRepo.checkCategoryPermissions([input.documentId], {
          lock: "share",
        });
        assertLockedDownloadAllowed(locked, input.user);
        await txRepo.recordDownloadAuditEvent({
          userId: input.user.id,
          userName: input.user.name ?? input.user.email,
          userEmail: input.user.email,
          documentId: input.documentId,
          documentName: file.originalName,
          downloadedAt: new Date(),
        });
      }),
  );

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
