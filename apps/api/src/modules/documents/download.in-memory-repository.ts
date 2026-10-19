import type {
  CreateDownloadAuditEventInput,
  DocumentCategoryPermissionStatus,
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

  public async checkCategoryPermissions(
    documentIds: ReadonlyArray<string>,
    _options?: { lock?: "share" | "update" } | undefined,
  ): Promise<ReadonlyArray<DocumentCategoryPermissionStatus>> {
    const results: DocumentCategoryPermissionStatus[] = [];
    for (const id of documentIds) {
      const target = this.targets.get(id);
      if (target) {
        results.push({
          documentId: target.document.id,
          categoryId: target.document.categoryId,
          deletedAt: target.document.deletedAt,
          downloadEnabled: target.categoryPermission?.downloadEnabled ?? null,
        });
      }
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

  public async transaction<T>(callback: (txRepo: IDownloadRepository) => Promise<T>): Promise<T> {
    return await callback(this);
  }

  public getRecordedAuditEvents(): ReadonlyArray<CreateDownloadAuditEventInput> {
    return [...this.auditEvents];
  }
}
