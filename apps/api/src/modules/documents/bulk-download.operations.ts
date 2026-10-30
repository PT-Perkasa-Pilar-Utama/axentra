import type { Logger } from "@axentra/observability";
import type { StorageAdapter } from "@axentra/storage";
import type { AuthUser } from "@axentra/shared";
import { TooManyRequestsError } from "../../http/errors";
import type { IDownloadRepository } from "./download.repository";
import { runDownloadAuditTransaction } from "./download.audit-transaction";
import { createZipArchive } from "./zip.writer";
import {
  BULK_DOWNLOAD_BUSY_MESSAGE,
  type BulkDownloadSemaphore,
  globalBulkDownloadSemaphore,
} from "./bulk-download.semaphore";
import {
  type BulkDownloadByteBudget,
  calculateBulkDownloadReservationBytes,
  globalBulkDownloadByteBudget,
} from "./bulk-download.byte-budget";
import { BULK_DOWNLOAD_TRANSFER_TIMEOUT_MS } from "./bulk-download.body";
import { prefetchBulkDownloadEntries, throwIfBulkDownloadAborted } from "./bulk-download.storage";
import { normalizeBulkDownloadIds, resolveBulkDownloadItems } from "./bulk-download.targets";
import { recheckAndRecordBulkAudit } from "./bulk-download.audit";

export const BULK_DOWNLOAD_ARCHIVE_FILENAME = "axentra-documents.zip";

export type BulkDownloadOperationDependencies = {
  downloadRepository: IDownloadRepository;
  storage: StorageAdapter;
  logger?: Logger | undefined;
  bulkDownloadSemaphore?: BulkDownloadSemaphore | undefined;
  bulkDownloadByteBudget?: BulkDownloadByteBudget | undefined;
  bulkDownloadTransferTimeoutMs?: number | undefined;
  storageTimeoutMs?: number | undefined;
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
  fileCount: number;
  // How long the slot and the reservation stay held after the response starts.
  transferTimeoutMs: number;
  // Releases the concurrency slot and the byte reservation; idempotent. The response body calls it when
  // the request aborts, the consumer cancels, or the transfer window ends (see createBulkDownloadBody).
  release: () => void;
};

// Takes the concurrency slot, then reserves the request's byte bound. Nothing has been read from
// storage yet, so a request that does not fit the budget gets 429 with no storage read and no audit.
async function acquireBulkDownloadCapacity(
  dependencies: BulkDownloadOperationDependencies,
  reservationBytes: number,
  signal: AbortSignal | undefined,
): Promise<() => void> {
  const semaphore = dependencies.bulkDownloadSemaphore ?? globalBulkDownloadSemaphore;
  const releaseSlot = await semaphore.acquire({ signal });
  const budget = dependencies.bulkDownloadByteBudget ?? globalBulkDownloadByteBudget;
  const releaseReservation = budget.tryReserve(reservationBytes);
  if (releaseReservation === null) {
    releaseSlot();
    throw new TooManyRequestsError(BULK_DOWNLOAD_BUSY_MESSAGE);
  }
  return () => {
    releaseReservation();
    releaseSlot();
  };
}

export async function executeBulkDownloadOperation(
  dependencies: BulkDownloadOperationDependencies,
  input: ExecuteBulkDownloadInput,
): Promise<BulkDownloadOperationResult> {
  // 1. Load the selected documents' metadata and run every check that needs no storage read.
  const uniqueIds = normalizeBulkDownloadIds(input.documentIds);
  const targets = await dependencies.downloadRepository.findDownloadTargets(uniqueIds);
  const items = resolveBulkDownloadItems(uniqueIds, targets, input.user);

  // 2-3. Bound the bytes from stored sizes plus ZIP overhead, and reserve them before any storage read.
  const reservationBytes = calculateBulkDownloadReservationBytes(
    items.map((item) => ({ name: item.file.originalName, size: item.file.fileSize })),
  );
  const release = await acquireBulkDownloadCapacity(dependencies, reservationBytes, input.signal);

  try {
    // 4. Prefetch and assemble. An abort is honoured between object reads and again before the audit,
    // so a request the client already abandoned writes no audit record.
    const entries = await prefetchBulkDownloadEntries(dependencies.storage, items, {
      signal: input.signal,
      timeoutMs: dependencies.storageTimeoutMs,
    });
    const bytes = createZipArchive(entries);
    throwIfBulkDownloadAborted(input.signal);

    // 5. Recheck permissions under row locks and record one audit event per document atomically.
    await runDownloadAuditTransaction(
      input.logger ?? dependencies.logger,
      "Gagal mencatat audit event bulk download",
      { requestId: input.requestId, userId: input.user.id, documentCount: items.length },
      () => recheckAndRecordBulkAudit(dependencies.downloadRepository, input.user, items),
    );

    return {
      filename: BULK_DOWNLOAD_ARCHIVE_FILENAME,
      bytes,
      fileCount: entries.length,
      transferTimeoutMs:
        dependencies.bulkDownloadTransferTimeoutMs ?? BULK_DOWNLOAD_TRANSFER_TIMEOUT_MS,
      release,
    };
  } catch (error: unknown) {
    // Abort, prefetch, assembly, and audit failures release the slot and the reservation here; a
    // successful result hands them to the response body.
    release();
    throw error;
  }
}
