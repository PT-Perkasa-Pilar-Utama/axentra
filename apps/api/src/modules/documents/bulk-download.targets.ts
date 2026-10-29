import {
  BULK_DOWNLOAD_MAX_TOTAL_BYTES,
  DOWNLOAD_ACCESS_DENIED_MESSAGE,
  type AuthUser,
} from "@axentra/shared";
import { ForbiddenError, NotFoundError, PayloadTooLargeError } from "../../http/errors";
import type { DownloadTargetRecord } from "./download.repository";
import { ZIP32_MAX_ENTRY_SIZE } from "./zip.writer";

export type BulkDownloadItem = {
  documentId: string;
  categoryId: string | null;
  categoryPermission: DownloadTargetRecord["categoryPermission"];
  file: NonNullable<DownloadTargetRecord["file"]>;
};

// PostgreSQL returns UUIDs in lowercase. IDs are lowercased before deduplication and lookup, so a valid
// uppercase UUID resolves and IDs that differ only in letter case become one entry and one audit row.
export function normalizeBulkDownloadIds(documentIds: ReadonlyArray<string>): Array<string> {
  return Array.from(new Set(documentIds.map((documentId) => documentId.toLowerCase())));
}

// Every selected document must exist, be active, and have a stored file; a 404 wins over a 403.
function resolveExistingItems(
  uniqueIds: ReadonlyArray<string>,
  targets: ReadonlyArray<DownloadTargetRecord>,
): Array<BulkDownloadItem> {
  const targetMap = new Map(targets.map((target) => [target.document.id, target]));
  return uniqueIds.map((documentId) => {
    const target = targetMap.get(documentId);
    if (!target || target.document.deletedAt !== null) {
      throw new NotFoundError("Dokumen tidak ditemukan");
    }
    if (!target.file) {
      throw new NotFoundError("File dokumen tidak ditemukan");
    }
    return {
      documentId,
      categoryId: target.document.categoryId,
      categoryPermission: target.categoryPermission,
      file: target.file,
    };
  });
}

// Category download permission applies to member_team only (AC-10.01, AC-13.01).
function assertCategoryPermissions(items: ReadonlyArray<BulkDownloadItem>, user: AuthUser): void {
  if (user.role !== "member_team") return;
  for (const item of items) {
    if (!item.categoryId || item.categoryPermission?.downloadEnabled !== true) {
      throw new ForbiddenError(DOWNLOAD_ACCESS_DENIED_MESSAGE);
    }
  }
}

// The 250 MB aggregate cap keeps the archive far below the ZIP32 4 GiB limit.
function assertSizeLimits(items: ReadonlyArray<BulkDownloadItem>): void {
  let totalBytes = 0;
  for (const item of items) {
    if (item.file.fileSize > ZIP32_MAX_ENTRY_SIZE) {
      throw new PayloadTooLargeError(
        `Ukuran berkas "${item.file.originalName}" melebihi batas 32-bit (4 GiB)`,
      );
    }
    totalBytes += item.file.fileSize;
  }

  if (totalBytes > BULK_DOWNLOAD_MAX_TOTAL_BYTES) {
    throw new PayloadTooLargeError(
      "Total ukuran dokumen melebihi batas maksimum unduhan massal (250 MB)",
    );
  }
}

/**
 * Checks the selected documents from database metadata only, before any slot, reservation, or storage
 * read: existence and stored file (404), member_team category permission (403), and size limits (413).
 * Returns the items in request order.
 */
export function resolveBulkDownloadItems(
  uniqueIds: ReadonlyArray<string>,
  targets: ReadonlyArray<DownloadTargetRecord>,
  user: AuthUser,
): ReadonlyArray<BulkDownloadItem> {
  const items = resolveExistingItems(uniqueIds, targets);
  assertCategoryPermissions(items, user);
  assertSizeLimits(items);
  return items;
}
