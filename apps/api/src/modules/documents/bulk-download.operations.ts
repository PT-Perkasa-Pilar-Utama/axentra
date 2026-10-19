import type { Logger } from "@axentra/observability";
import { summarizeError } from "@axentra/observability";
import type { StorageAdapter } from "@axentra/storage";
import {
  BULK_DOWNLOAD_MAX_TOTAL_BYTES,
  DOWNLOAD_ACCESS_DENIED_MESSAGE,
  type AuthUser,
} from "@axentra/shared";
import { ForbiddenError, NotFoundError, PayloadTooLargeError } from "../../http/errors";
import type { IDownloadRepository } from "./download.repository";
import { createZipArchive, type ZipEntry } from "./zip.writer";

export type BulkDownloadOperationDependencies = {
  downloadRepository: IDownloadRepository;
  storage: StorageAdapter;
  logger?: Logger | undefined;
};

export type ExecuteBulkDownloadInput = {
  documentIds: ReadonlyArray<string>;
  user: AuthUser;
};

export type BulkDownloadOperationResult = {
  filename: string;
  bytes: Uint8Array;
  fileCount: number;
};

export async function executeBulkDownloadOperation(
  dependencies: BulkDownloadOperationDependencies,
  input: ExecuteBulkDownloadInput,
): Promise<BulkDownloadOperationResult> {
  const uniqueIds = Array.from(new Set(input.documentIds));
  const targets = await dependencies.downloadRepository.findDownloadTargets(uniqueIds);
  const targetMap = new Map(targets.map((t) => [t.document.id, t]));

  // 1. Verify all selected documents exist and are not soft-deleted
  for (const docId of uniqueIds) {
    const target = targetMap.get(docId);
    if (!target || target.document.deletedAt !== null) {
      throw new NotFoundError("Dokumen tidak ditemukan");
    }

    if (!target.file) {
      throw new NotFoundError("File dokumen tidak ditemukan");
    }
  }

  // 2. Enforce category download permissions per item for member_team (AC-10.01, AC-13.01)
  if (input.user.role === "member_team") {
    for (const docId of uniqueIds) {
      const target = targetMap.get(docId);
      if (!target) continue;

      if (!target.document.categoryId) {
        throw new ForbiddenError(DOWNLOAD_ACCESS_DENIED_MESSAGE);
      }

      if (!target.categoryPermission || !target.categoryPermission.downloadEnabled) {
        throw new ForbiddenError(DOWNLOAD_ACCESS_DENIED_MESSAGE);
      }
    }
  }

  // 3. Enforce aggregate file size limit before fetching objects into memory (F2)
  const totalBytes = uniqueIds.reduce((sum, docId) => {
    const target = targetMap.get(docId);
    return sum + (target?.file?.fileSize ?? 0);
  }, 0);

  if (totalBytes > BULK_DOWNLOAD_MAX_TOTAL_BYTES) {
    throw new PayloadTooLargeError(
      "Total ukuran dokumen melebihi batas maksimum unduhan massal (250 MB)",
    );
  }

  // 4. Fetch file binaries from storage
  const entries: Array<ZipEntry> = [];
  for (const docId of uniqueIds) {
    const target = targetMap.get(docId);
    if (!target?.file) continue;

    const fileBytes = await dependencies.storage.getObject(target.file.storageKey);
    entries.push({
      name: target.file.originalName,
      content: fileBytes,
    });
  }

  // 5. Assemble the ZIP archive (with path traversal sanitization and filename collision handling)
  const zipBytes = createZipArchive(entries);

  // 6. Atomically recheck category permissions and record point-in-time audit events (F3)
  try {
    const now = new Date();
    await dependencies.downloadRepository.recordAuthorizedDownloadAuditEvents({
      user: input.user,
      documentIds: uniqueIds,
      events: uniqueIds.map((docId) => {
        const target = targetMap.get(docId);
        const fileName = target?.file?.originalName ?? "unknown";
        return {
          userId: input.user.id,
          userName: input.user.name ?? input.user.email,
          userEmail: input.user.email,
          documentId: docId,
          documentName: fileName,
          downloadedAt: now,
        };
      }),
    });
  } catch (error) {
    dependencies.logger?.error(
      {
        userId: input.user.id,
        documentCount: uniqueIds.length,
        error: summarizeError(error),
      },
      "Gagal mencatat audit event bulk download",
    );
    throw error;
  }

  return {
    filename: "axentra-documents.zip",
    bytes: zipBytes,
    fileCount: entries.length,
  };
}
