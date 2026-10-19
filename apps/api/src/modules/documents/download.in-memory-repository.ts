import { DOWNLOAD_ACCESS_DENIED_MESSAGE } from "@axentra/shared";
import { ForbiddenError, NotFoundError } from "../../http/errors";
import type {
  AtomicDownloadAuditInput,
  CreateDownloadAuditEventInput,
  DownloadTargetRecord,
  IDownloadRepository,
} from "./download.repository";

export class InMemoryDownloadRepository implements IDownloadRepository {
  private readonly targets = new Map<string, DownloadTargetRecord>();
  private readonly auditEvents: CreateDownloadAuditEventInput[] = [];

  public setTarget(documentId: string, record: DownloadTargetRecord): void {
    this.targets.set(documentId, record);
  }

  public getTarget(documentId: string): DownloadTargetRecord | null {
    return this.targets.get(documentId) ?? null;
  }

  public async findDownloadTarget(documentId: string): Promise<DownloadTargetRecord | null> {
    return this.targets.get(documentId) ?? null;
  }

  public async findDownloadTargets(
    documentIds: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<DownloadTargetRecord>> {
    const results: DownloadTargetRecord[] = [];
    for (const id of documentIds) {
      const target = this.targets.get(id);
      if (target) results.push(target);
    }
    return results;
  }

  public async recordDownloadAuditEvent(event: CreateDownloadAuditEventInput): Promise<void> {
    this.auditEvents.push({
      ...event,
      downloadedAt: event.downloadedAt ?? new Date(),
    });
  }

  public async recordDownloadAuditEvents(
    events: ReadonlyArray<CreateDownloadAuditEventInput>,
  ): Promise<void> {
    for (const event of events) {
      this.auditEvents.push({
        ...event,
        downloadedAt: event.downloadedAt ?? new Date(),
      });
    }
  }

  public async recordAuthorizedDownloadAuditEvents(input: AtomicDownloadAuditInput): Promise<void> {
    if (input.documentIds.length === 0) return;

    if (input.user.role === "member_team") {
      for (const docId of input.documentIds) {
        const target = this.targets.get(docId);
        if (!target || target.document.deletedAt !== null) {
          throw new NotFoundError("Dokumen tidak ditemukan");
        }
        if (
          !target.document.categoryId ||
          !target.categoryPermission ||
          !target.categoryPermission.downloadEnabled
        ) {
          throw new ForbiddenError(DOWNLOAD_ACCESS_DENIED_MESSAGE);
        }
      }
    }

    for (const event of input.events) {
      this.auditEvents.push({
        ...event,
        downloadedAt: event.downloadedAt ?? new Date(),
      });
    }
  }

  public getRecordedAuditEvents(): ReadonlyArray<CreateDownloadAuditEventInput> {
    return [...this.auditEvents];
  }
}
