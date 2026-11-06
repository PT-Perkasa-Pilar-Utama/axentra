import { count, eq, gte, isNull, max, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentFiles, documents, downloadAuditEvents, users } from "@axentra/db";
import type { AdminSummary, ProcessingStatus, UserRole } from "@axentra/shared";

export type IAdminRepository = {
  getSummary: (uploadedSince: Date) => Promise<AdminSummary>;
};

function formatLatestDownloadAt(raw: unknown): string | null {
  if (raw instanceof Date) {
    return raw.toISOString();
  }
  // Defensive handling for string timestamp returns if provided by underlying driver.
  if (typeof raw === "string") {
    return new Date(raw).toISOString();
  }
  return null;
}

// Justification for class: implements IAdminRepository port to support dependency
// injection and in-memory test doubles, following DrizzleAnalyticsRepository precedent.
export class DrizzleAdminRepository implements IAdminRepository {
  public constructor(private readonly sqlDb: PostgresJsDatabase) {}

  public async getSummary(uploadedSince: Date): Promise<AdminSummary> {
    const [docsQuery, usersQuery, downloadsQuery] = await Promise.all([
      this.sqlDb
        .select({
          totalDocuments: count(),
          uploadedLast7Days: sql<number>`count(*) filter (where ${gte(documents.createdAt, uploadedSince)})`,
        })
        .from(documents)
        .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
        .where(isNull(documents.deletedAt)),

      this.sqlDb
        .select({
          memberTeamCount: sql<number>`count(*) filter (where ${eq(users.role, "member_team")})`,
          headOfTeamCount: sql<number>`count(*) filter (where ${eq(users.role, "head_of_team")})`,
          adminCount: sql<number>`count(*) filter (where ${eq(users.role, "admin")})`,
        })
        .from(users),

      this.sqlDb
        .select({
          downloadCount: count(),
          latestDownloadAt: max(downloadAuditEvents.downloadedAt),
        })
        .from(downloadAuditEvents),
    ]);

    const docsRow = docsQuery[0];
    const usersRow = usersQuery[0];
    const downloadsRow = downloadsQuery[0];

    const latestDownloadAt = formatLatestDownloadAt(downloadsRow?.latestDownloadAt);

    return {
      usersByRole: {
        member_team: Number(usersRow?.memberTeamCount ?? 0),
        head_of_team: Number(usersRow?.headOfTeamCount ?? 0),
        admin: Number(usersRow?.adminCount ?? 0),
      },
      totalDocuments: Number(docsRow?.totalDocuments ?? 0),
      uploadedLast7Days: Number(docsRow?.uploadedLast7Days ?? 0),
      downloadCount: Number(downloadsRow?.downloadCount ?? 0),
      latestDownloadAt,
    };
  }
}

export type InMemoryAdminUserRecord = {
  id: string;
  role: UserRole;
  // Retained for test fixture parity; getSummary counts all users regardless of status per proposed default O10.
  status?: "active" | "inactive" | undefined;
};

export type InMemoryAdminDocumentRecord = {
  id: string;
  createdAt: Date;
  deletedAt?: Date | null | undefined;
  // Retained for test fixture parity; getSummary includes archived documents per proposed default O7.
  archivedAt?: Date | null | undefined;
  hasFile: boolean;
  // Retained for test fixture parity with the document schema across processing states.
  processingStatus?: ProcessingStatus | undefined;
};

export type InMemoryAdminDownloadRecord = {
  id: string;
  downloadedAt: Date;
};

// In-memory repository implementation for unit and route tests.
export class InMemoryAdminRepository implements IAdminRepository {
  public readonly users = new Map<string, InMemoryAdminUserRecord>();
  public readonly documents = new Map<string, InMemoryAdminDocumentRecord>();
  public readonly downloads = new Map<string, InMemoryAdminDownloadRecord>();

  public async getSummary(uploadedSince: Date): Promise<AdminSummary> {
    const usersByRole = {
      member_team: 0,
      head_of_team: 0,
      admin: 0,
    };

    for (const user of this.users.values()) {
      if (user.role in usersByRole) {
        usersByRole[user.role] += 1;
      }
    }

    let totalDocuments = 0;
    let uploadedLast7Days = 0;
    const cutoffMs = uploadedSince.getTime();

    for (const doc of this.documents.values()) {
      if (doc.deletedAt !== undefined && doc.deletedAt !== null) {
        continue;
      }
      // Require an attached file record, matching the SQL inner join with document_files.
      if (!doc.hasFile) {
        continue;
      }
      totalDocuments += 1;
      if (doc.createdAt.getTime() >= cutoffMs) {
        uploadedLast7Days += 1;
      }
    }

    let downloadCount = 0;
    let latestDownloadAtDate: Date | null = null;

    for (const download of this.downloads.values()) {
      downloadCount += 1;
      if (
        latestDownloadAtDate === null ||
        download.downloadedAt.getTime() > latestDownloadAtDate.getTime()
      ) {
        latestDownloadAtDate = download.downloadedAt;
      }
    }

    return {
      usersByRole,
      totalDocuments,
      uploadedLast7Days,
      downloadCount,
      latestDownloadAt: latestDownloadAtDate ? latestDownloadAtDate.toISOString() : null,
    };
  }
}
