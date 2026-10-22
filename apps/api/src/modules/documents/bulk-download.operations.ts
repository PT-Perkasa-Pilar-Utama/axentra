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
  createZipArchive,
  ZIP32_MAX_ENTRY_COUNT,
  ZIP32_MAX_ENTRY_SIZE,
  type ZipEntry,
} from "./zip.writer";
import { type BulkDownloadSemaphore, globalBulkDownloadSemaphore } from "./bulk-download.semaphore";
import { createMonitoredZipStream, getObjectWithTimeout } from "./bulk-download.stream";

export type BulkDownloadOperationDependencies = {
  downloadRepository: IDownloadRepository;
  storage: StorageAdapter;
  logger?: Logger | undefined;
  bulkDownloadSemaphore?: BulkDownloadSemaphore | undefined;
  streamChunkSize?: number | undefined;
};

export type ExecuteBulkDownloadInput = {
  documentIds: ReadonlyArray<string>;
  user: AuthUser;
  logger?: Logger | undefined;
  requestId?: string | undefined;
  signal?: AbortSignal | undefined;
};

export type BulkDownloadOperationResult = {
  filename: string;
  bytes: Uint8Array;
  stream: ReadableStream<Uint8Array>;
  contentLength: number;
  fileCount: number;
  release: () => void;
};

export async function executeBulkDownloadOperation(
  dependencies: BulkDownloadOperationDependencies,
  input: ExecuteBulkDownloadInput,
): Promise<BulkDownloadOperationResult> {
  const uniqueIds = Array.from(new Set(input.documentIds));

  // 1. Enforce ZIP32 entry count limit before database operations (F2)
  if (uniqueIds.length > ZIP32_MAX_ENTRY_COUNT) {
    throw new PayloadTooLargeError("Jumlah dokumen melebihi batas maksimum arsip ZIP (65.535)");
  }

  const targets = await dependencies.downloadRepository.findDownloadTargets(uniqueIds);
  const targetMap = new Map(targets.map((t) => [t.document.id, t]));

  // 2. Verify all selected documents exist and are not soft-deleted
  for (const docId of uniqueIds) {
    const target = targetMap.get(docId);
    if (!target || target.document.deletedAt !== null) {
      throw new NotFoundError("Dokumen tidak ditemukan");
    }

    if (!target.file) {
      throw new NotFoundError("File dokumen tidak ditemukan");
    }
  }

  // 3. Enforce category download permissions per item for member_team (AC-10.01, AC-13.01)
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

  // 4. Enforce aggregate and individual file size limits before storage retrieval (F2)
  let totalBytes = 0;
  for (const docId of uniqueIds) {
    const target = targetMap.get(docId);
    const size = target?.file?.fileSize ?? 0;
    if (size > ZIP32_MAX_ENTRY_SIZE) {
      throw new PayloadTooLargeError(
        `Ukuran berkas "${target?.file?.originalName ?? docId}" melebihi batas 32-bit (4 GiB)`,
      );
    }
    totalBytes += size;
  }

  if (totalBytes > BULK_DOWNLOAD_MAX_TOTAL_BYTES) {
    throw new PayloadTooLargeError(
      "Total ukuran dokumen melebihi batas maksimum unduhan massal (250 MB)",
    );
  }

  // 5. Acquire concurrency slot to protect peak RSS during storage prefetch, archive assembly, and streaming (F7, F10, F24, F25)
  // Note (F21): Total aggregate size is checked against 250 MB (BULK_DOWNLOAD_MAX_TOTAL_BYTES) in step 4,
  // which strictly guarantees total archive size never approaches the ZIP32 4 GiB limit.
  const semaphore = dependencies.bulkDownloadSemaphore ?? globalBulkDownloadSemaphore;
  const releaseSlot = await semaphore.acquire({ signal: input.signal });
  let slotClaimedByStream = false;

  try {
    // 6. Prefetch all storage objects before audit recording and response generation (F7, F12, F15, F17, F25)
    const entries: Array<ZipEntry> = [];
    for (const docId of uniqueIds) {
      const target = targetMap.get(docId);
      if (!target?.file) continue;

      const fileBytes = await getObjectWithTimeout(dependencies.storage, target.file.storageKey);
      if (fileBytes.byteLength !== target.file.fileSize) {
        throw new Error(
          `Ukuran berkas "${target.file.originalName}" (${fileBytes.byteLength} byte) tidak sesuai dengan metadata (${target.file.fileSize} byte)`,
        );
      }

      entries.push({
        name: target.file.originalName,
        content: fileBytes,
      });
    }

    // 7. Assemble the ZIP archive using single-pass continuous buffer allocation (F2, F7)
    const bytes = createZipArchive(entries);

    // 8. Atomically recheck category permissions with row lock and record point-in-time audit events (F3, F6, F12)
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
      const effectiveLogger = input.logger ?? dependencies.logger;
      effectiveLogger?.error(
        {
          requestId: input.requestId,
          userId: input.user.id,
          documentCount: uniqueIds.length,
          error: summarizeError(error),
        },
        "Gagal mencatat audit event bulk download",
      );
      throw error;
    }

    // 9. Wrap archive buffer in a monitored stream that holds the semaphore slot until fully transmitted (F24)
    const stream = createMonitoredZipStream(bytes, releaseSlot, {
      signal: input.signal,
      chunkSize: dependencies.streamChunkSize,
    });
    slotClaimedByStream = true;

    return {
      filename: "axentra-documents.zip",
      bytes,
      stream,
      contentLength: bytes.byteLength,
      fileCount: entries.length,
      release: releaseSlot,
    };
  } finally {
    if (!slotClaimedByStream) {
      releaseSlot();
    }
  }
}
