import { count, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { downloadAuditEvents, users } from "@axentra/db";
import {
  DOWNLOAD_AUDIT_DEFAULT_LIMIT,
  DOWNLOAD_AUDIT_DEFAULT_PAGE,
  DOWNLOAD_AUDIT_MAX_LIMIT,
  DOWNLOAD_AUDIT_MAX_PAGE,
  type DownloadAuditEvent,
  type DownloadAuditListQuery,
} from "@axentra/shared";

export type DownloadAuditPage = {
  items: ReadonlyArray<DownloadAuditEvent>;
  total: number;
};

export type IAuditRepository = {
  listDownloadAuditEvents: (query: DownloadAuditListQuery) => Promise<DownloadAuditPage>;
};

export class DrizzleAuditRepository implements IAuditRepository {
  public constructor(private readonly sqlDb: PostgresJsDatabase) {}

  public async listDownloadAuditEvents(
    query: DownloadAuditListQuery = {
      page: DOWNLOAD_AUDIT_DEFAULT_PAGE,
      limit: DOWNLOAD_AUDIT_DEFAULT_LIMIT,
    },
  ): Promise<DownloadAuditPage> {
    const effectivePage = Math.min(Math.max(1, query.page), DOWNLOAD_AUDIT_MAX_PAGE);
    const effectiveLimit = Math.min(Math.max(1, query.limit), DOWNLOAD_AUDIT_MAX_LIMIT);

    const [counted] = await this.sqlDb.select({ total: count() }).from(downloadAuditEvents);
    const total = Number(counted?.total ?? 0);

    const rows = await this.sqlDb
      .select({
        id: downloadAuditEvents.id,
        userId: downloadAuditEvents.userId,
        userName: downloadAuditEvents.userName,
        userEmail: downloadAuditEvents.userEmail,
        joinedUserName: users.name,
        joinedUserEmail: users.email,
        documentId: downloadAuditEvents.documentId,
        documentName: downloadAuditEvents.documentName,
        downloadedAt: downloadAuditEvents.downloadedAt,
      })
      .from(downloadAuditEvents)
      .leftJoin(users, eq(users.id, downloadAuditEvents.userId))
      .orderBy(desc(downloadAuditEvents.downloadedAt), desc(downloadAuditEvents.id))
      .limit(effectiveLimit)
      .offset((effectivePage - 1) * effectiveLimit);

    return {
      items: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        userName:
          row.userName ?? row.joinedUserName ?? row.userEmail ?? row.joinedUserEmail ?? null,
        userEmail: row.userEmail ?? row.joinedUserEmail ?? null,
        documentId: row.documentId,
        documentName: row.documentName,
        downloadedAt: row.downloadedAt.toISOString(),
      })),
      total,
    };
  }
}

export class InMemoryAuditRepository implements IAuditRepository {
  public readonly events: Array<DownloadAuditEvent> = [];

  public addEvent(event: DownloadAuditEvent): void {
    this.events.push(event);
  }

  public async listDownloadAuditEvents(
    query: DownloadAuditListQuery = {
      page: DOWNLOAD_AUDIT_DEFAULT_PAGE,
      limit: DOWNLOAD_AUDIT_DEFAULT_LIMIT,
    },
  ): Promise<DownloadAuditPage> {
    const effectivePage = Math.min(Math.max(1, query.page), DOWNLOAD_AUDIT_MAX_PAGE);
    const effectiveLimit = Math.min(Math.max(1, query.limit), DOWNLOAD_AUDIT_MAX_LIMIT);
    const sorted = [...this.events].sort((left, right) => {
      const timeDelta = Date.parse(right.downloadedAt) - Date.parse(left.downloadedAt);
      if (timeDelta !== 0) return timeDelta;
      return right.id.localeCompare(left.id);
    });
    const offset = (effectivePage - 1) * effectiveLimit;
    return {
      items: sorted.slice(offset, offset + effectiveLimit),
      total: sorted.length,
    };
  }
}
