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
import {
  calculateZipArchiveSize,
  createZipReadableStream,
  type ZipStreamEntry,
} from "./zip.writer";

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
  stream: ReadableStream<Uint8Array>;
  contentLength: number;
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

  // 4. Verify storage connectivity on the first file before committing audit or starting stream
  // This ensures storage outages fail immediately with 500 without recording false audit events
  const firstTarget = targetMap.get(uniqueIds[0] ?? "");
  let firstFileBytes: Uint8Array | undefined;
  if (firstTarget?.file) {
    firstFileBytes = await dependencies.storage.getObject(firstTarget.file.storageKey);
  }

  // 5. Atomically recheck category permissions with row lock and record point-in-time audit events (F3, F6)
  try {
    await dependencies.downloadRepository.transaction(async (txRepo) => {
      if (input.user.role === "member_team") {
        const permissionRows = await txRepo.checkCategoryPermissions(uniqueIds, {
          lock: "share",
        });
        const permMap = new Map(permissionRows.map((r) => [r.documentId, r]));

        for (const docId of uniqueIds) {
          const perm = permMap.get(docId);
          if (!perm || perm.deletedAt !== null) {
            throw new NotFoundError("Dokumen tidak ditemukan");
          }
          if (!perm.categoryId || perm.downloadEnabled !== true) {
            throw new ForbiddenError(DOWNLOAD_ACCESS_DENIED_MESSAGE);
          }
        }
      }

      const now = new Date();
      await txRepo.recordDownloadAuditEvents(
        uniqueIds.map((docId) => {
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
      );
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

  // 6. Build lazy streaming items: each file is fetched on-demand and dereferenced immediately (F7)
  const streamItems: Array<ZipStreamEntry> = [];
  let isFirst = true;
  for (const docId of uniqueIds) {
    const target = targetMap.get(docId);
    if (!target?.file) continue;

    const storageKey = target.file.storageKey;
    const name = target.file.originalName;
    if (isFirst && firstFileBytes) {
      streamItems.push({
        name,
        content: firstFileBytes,
      });
      isFirst = false;
    } else {
      streamItems.push({
        name,
        content: () => dependencies.storage.getObject(storageKey),
      });
    }
  }

  // 7. Calculate exact total archive length and construct streaming response
  const metaList = streamItems.map((item, index) => {
    const docId = uniqueIds[index];
    const target = docId ? targetMap.get(docId) : undefined;
    return {
      name: item.name,
      size: target?.file?.fileSize ?? 0,
    };
  });
  const contentLength = calculateZipArchiveSize(metaList);
  const stream = createZipReadableStream(streamItems);

  return {
    filename: "axentra-documents.zip",
    stream,
    contentLength,
    fileCount: streamItems.length,
  };
}
