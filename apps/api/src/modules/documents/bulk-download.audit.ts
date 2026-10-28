import { DOWNLOAD_ACCESS_DENIED_MESSAGE, type AuthUser } from "@axentra/shared";
import { ForbiddenError, NotFoundError } from "../../http/errors";
import type { IDownloadRepository } from "./download.repository";
import type { BulkDownloadItem } from "./bulk-download.targets";

// Runs inside the audit unit of work: rechecks each selected document under a share lock, then records
// one audit event per document in the same transaction, so a revoke cannot slip in between.
export async function recheckAndRecordBulkAudit(
  downloadRepository: IDownloadRepository,
  user: AuthUser,
  items: ReadonlyArray<BulkDownloadItem>,
): Promise<void> {
  const documentIds = items.map((item) => item.documentId);
  await downloadRepository.transaction(async (txRepo) => {
    // Deletion is rechecked for every role; the category permission applies to member_team only.
    const permissionRows = await txRepo.checkCategoryPermissions(documentIds, {
      lock: "share",
    });
    const permMap = new Map(permissionRows.map((r) => [r.documentId, r]));

    for (const documentId of documentIds) {
      const perm = permMap.get(documentId);
      if (!perm || perm.deletedAt !== null) {
        throw new NotFoundError("Dokumen tidak ditemukan");
      }
      if (user.role === "member_team" && (!perm.categoryId || perm.downloadEnabled !== true)) {
        throw new ForbiddenError(DOWNLOAD_ACCESS_DENIED_MESSAGE);
      }
    }

    const now = new Date();
    await txRepo.recordDownloadAuditEvents(
      items.map((item) => ({
        userId: user.id,
        userName: user.name ?? user.email,
        userEmail: user.email,
        documentId: item.documentId,
        documentName: item.file.originalName,
        downloadedAt: now,
      })),
    );
  });
}
