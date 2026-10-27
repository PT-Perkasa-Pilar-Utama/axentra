import type {
  CreateDownloadAuditEventInput,
  DocumentCategoryPermissionStatus,
  DownloadTargetRecord,
  IDownloadRepository,
} from "./download.repository";

// Mirrors PostgreSQL, where a document without a category has no permission to read.
function withCategoryPermission(record: DownloadTargetRecord): DownloadTargetRecord {
  return record.document.categoryId === null ? { ...record, categoryPermission: null } : record;
}

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
    const target = this.targets.get(documentId);
    return target ? withCategoryPermission(target) : null;
  }

  public async findDownloadTargets(
    documentIds: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<DownloadTargetRecord>> {
    const results: DownloadTargetRecord[] = [];
    for (const id of documentIds) {
      const target = this.targets.get(id);
      if (target) results.push(withCategoryPermission(target));
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
          // Mirrors PostgreSQL, where a document without a category has no permission to read.
          downloadEnabled:
            target.document.categoryId === null
              ? null
              : (target.categoryPermission?.downloadEnabled ?? null),
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

  // Audit rows are buffered and committed only when the unit of work succeeds, like the database.
  public async transaction<T>(callback: (txRepo: IDownloadRepository) => Promise<T>): Promise<T> {
    const pendingAuditEvents: CreateDownloadAuditEventInput[] = [];
    const txRepo: IDownloadRepository = {
      findDownloadTarget: (documentId) => this.findDownloadTarget(documentId),
      findDownloadTargets: (documentIds) => this.findDownloadTargets(documentIds),
      checkCategoryPermissions: (documentIds, options) =>
        this.checkCategoryPermissions(documentIds, options),
      recordDownloadAuditEvent: async (event) => {
        pendingAuditEvents.push({ ...event, downloadedAt: event.downloadedAt ?? new Date() });
      },
      recordDownloadAuditEvents: async (events) => {
        for (const event of events) {
          pendingAuditEvents.push({ ...event, downloadedAt: event.downloadedAt ?? new Date() });
        }
      },
      // Savepoints are not modelled, so a nested unit of work fails loudly instead of leaking its rows.
      transaction: async () => {
        throw new Error("Nested transactions are not modelled by InMemoryDownloadRepository");
      },
    };

    const result = await callback(txRepo);
    this.auditEvents.push(...pendingAuditEvents);
    return result;
  }

  public getRecordedAuditEvents(): ReadonlyArray<CreateDownloadAuditEventInput> {
    return [...this.auditEvents];
  }
}
