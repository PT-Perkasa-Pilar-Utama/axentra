import { count, eq, gte, isNull, sql } from "drizzle-orm";

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { documentFiles, documents } from "@axentra/db";
import type { AnalyticsSummary, ProcessingStatus } from "@axentra/shared";

export type IAnalyticsRepository = {
  getSummary: (uploadedSince: Date) => Promise<AnalyticsSummary>;
};

export class DrizzleAnalyticsRepository implements IAnalyticsRepository {
  public constructor(private readonly sqlDb: PostgresJsDatabase) {}

  public async getSummary(uploadedSince: Date): Promise<AnalyticsSummary> {
    // Compute both metrics in one query so total and 7-day counts read the same snapshot.
    const [row] = await this.sqlDb
      .select({
        totalDocuments: count(),
        uploadedLast7Days: sql<number>`count(*) filter (where ${gte(documents.createdAt, uploadedSince)})`,
      })
      .from(documents)
      .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
      .where(isNull(documents.deletedAt));

    return {
      totalDocuments: Number(row?.totalDocuments ?? 0),
      uploadedLast7Days: Number(row?.uploadedLast7Days ?? 0),
    };
  }
}

export type InMemoryAnalyticsDocumentRecord = {
  id: string;
  createdAt: Date;
  deletedAt?: Date | null | undefined;
  hasFile?: boolean | undefined;
  processingStatus?: ProcessingStatus | undefined;
};

export class InMemoryAnalyticsRepository implements IAnalyticsRepository {
  public readonly documents = new Map<string, InMemoryAnalyticsDocumentRecord>();

  public async getSummary(uploadedSince: Date): Promise<AnalyticsSummary> {
    let totalDocuments = 0;
    let uploadedLast7Days = 0;
    const cutoffMs = uploadedSince.getTime();

    for (const doc of this.documents.values()) {
      if (doc.deletedAt !== undefined && doc.deletedAt !== null) {
        continue;
      }
      if (doc.hasFile === false) {
        continue;
      }
      totalDocuments += 1;
      if (doc.createdAt.getTime() >= cutoffMs) {
        uploadedLast7Days += 1;
      }
    }

    return {
      totalDocuments,
      uploadedLast7Days,
    };
  }
}
