import type { DownloadAuditEvent, DownloadAuditListQuery, PaginationMeta } from "@axentra/shared";
import type { IAuditRepository } from "./audit.repository";

export type ListDownloadAuditEventsResult = {
  items: ReadonlyArray<DownloadAuditEvent>;
  meta: PaginationMeta;
};

export type IAuditService = {
  listDownloadAuditEvents: (
    query: DownloadAuditListQuery,
  ) => Promise<ListDownloadAuditEventsResult>;
};

export class AuditService implements IAuditService {
  public constructor(private readonly repository: IAuditRepository) {}

  public async listDownloadAuditEvents(
    query: DownloadAuditListQuery,
  ): Promise<ListDownloadAuditEventsResult> {
    const page = await this.repository.listDownloadAuditEvents(query);
    return {
      items: page.items,
      meta: {
        page: query.page,
        limit: query.limit,
        total: page.total,
      },
    };
  }
}

export function createAuditService(repository: IAuditRepository): AuditService {
  return new AuditService(repository);
}
