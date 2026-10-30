import { describe, expect, it } from "bun:test";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createLogger } from "@axentra/observability";
import {
  analyticsSummaryResponseSchema,
  type AnalyticsSummary,
  type ApiErrorEnvelope,
} from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { DrizzleAnalyticsRepository, InMemoryAnalyticsRepository } from "./analytics.repository";
import { createAnalyticsService } from "./analytics.service";

const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const tokenVerifier: TokenVerifier = {
  verifyToken(token: string) {
    if (token === "valid-head-token") {
      return {
        id: "usr-head-1",
        email: "head@axentra.local",
        role: "head_of_team",
        name: "Head of Team User",
      };
    }
    if (token === "valid-member-token") {
      return {
        id: "usr-member-1",
        email: "member@axentra.local",
        role: "member_team",
        name: "Member User",
      };
    }
    if (token === "valid-admin-token") {
      return {
        id: "usr-admin-1",
        email: "admin@axentra.local",
        role: "admin",
        name: "Admin User",
      };
    }
    return null;
  },
};

describe("GET /api/v1/analytics/summary - Task BE-S4-01 (AC-11.01, AC-11.02)", () => {
  const fixedNow = new Date("2026-10-30T12:00:00.000Z");

  it("returns 200 with zero counts when no documents exist", async () => {
    const repository = new InMemoryAnalyticsRepository();
    const analyticsService = createAnalyticsService(repository, { now: () => fixedNow });
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      analyticsService,
    });

    const res = await app.request("/api/v1/analytics/summary", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-head-token",
      },
    });

    expect(res.status).toBe(200);
    const parsed = analyticsSummaryResponseSchema.parse(await res.json());
    expect(parsed.data).toEqual({
      totalDocuments: 0,
      uploadedLast7Days: 0,
    });
  });

  it("returns totalDocuments and uploadedLast7Days for head_of_team and excludes soft-deleted or fileless records", async () => {
    const repository = new InMemoryAnalyticsRepository();
    const analyticsService = createAnalyticsService(repository, { now: () => fixedNow });
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      analyticsService,
    });

    repository.documents.set("doc-recent-completed", {
      id: "doc-recent-completed",
      createdAt: new Date("2026-10-29T10:00:00.000Z"),
      processingStatus: "completed",
    });
    repository.documents.set("doc-boundary-exact-7-days", {
      id: "doc-boundary-exact-7-days",
      createdAt: new Date("2026-10-23T12:00:00.000Z"),
      processingStatus: "queued",
    });
    repository.documents.set("doc-recent-failed-processing", {
      id: "doc-recent-failed-processing",
      createdAt: new Date("2026-10-25T08:00:00.000Z"),
      processingStatus: "failed",
    });
    repository.documents.set("doc-before-7-days-boundary", {
      id: "doc-before-7-days-boundary",
      createdAt: new Date("2026-10-23T11:59:59.999Z"),
      processingStatus: "completed",
    });
    repository.documents.set("doc-older", {
      id: "doc-older",
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
      processingStatus: "completed",
    });
    repository.documents.set("doc-soft-deleted-recent", {
      id: "doc-soft-deleted-recent",
      createdAt: new Date("2026-10-30T01:00:00.000Z"),
      deletedAt: new Date("2026-10-30T02:00:00.000Z"),
      processingStatus: "completed",
    });
    repository.documents.set("doc-without-file", {
      id: "doc-without-file",
      createdAt: new Date("2026-10-30T01:00:00.000Z"),
      hasFile: false,
      processingStatus: "queued",
    });

    const res = await app.request("/api/v1/analytics/summary", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-head-token",
      },
    });

    expect(res.status).toBe(200);
    const parsed = analyticsSummaryResponseSchema.parse(await res.json());
    expect(parsed.data).toEqual({
      totalDocuments: 5,
      uploadedLast7Days: 3,
    });
  });

  it("returns 401 UNAUTHORIZED when Authorization header is missing or invalid", async () => {
    const repository = new InMemoryAnalyticsRepository();
    const analyticsService = createAnalyticsService(repository, { now: () => fixedNow });
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      analyticsService,
    });

    const missingHeaderRes = await app.request("/api/v1/analytics/summary", {
      method: "GET",
    });
    expect(missingHeaderRes.status).toBe(401);
    const missingBody = (await missingHeaderRes.json()) as ApiErrorEnvelope;
    expect(missingBody.success).toBe(false);
    expect(missingBody.error.code).toBe("UNAUTHORIZED");

    const invalidTokenRes = await app.request("/api/v1/analytics/summary", {
      method: "GET",
      headers: {
        Authorization: "Bearer unknown-token",
      },
    });
    expect(invalidTokenRes.status).toBe(401);
    const invalidBody = (await invalidTokenRes.json()) as ApiErrorEnvelope;
    expect(invalidBody.success).toBe(false);
    expect(invalidBody.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 FORBIDDEN when caller role is member_team or admin", async () => {
    const repository = new InMemoryAnalyticsRepository();
    const analyticsService = createAnalyticsService(repository, { now: () => fixedNow });
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      analyticsService,
    });

    const memberRes = await app.request("/api/v1/analytics/summary", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-member-token",
      },
    });
    expect(memberRes.status).toBe(403);
    const memberBody = (await memberRes.json()) as ApiErrorEnvelope;
    expect(memberBody.success).toBe(false);
    expect(memberBody.error.code).toBe("FORBIDDEN");

    const adminRes = await app.request("/api/v1/analytics/summary", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-admin-token",
      },
    });
    expect(adminRes.status).toBe(403);
    const adminBody = (await adminRes.json()) as ApiErrorEnvelope;
    expect(adminBody.success).toBe(false);
    expect(adminBody.error.code).toBe("FORBIDDEN");
  });

  it("normalizes numeric and string aggregate results in DrizzleAnalyticsRepository", async () => {
    let whereCalled = false;
    const fakeDb = {
      select() {
        return {
          from() {
            return {
              innerJoin() {
                return {
                  async where(): Promise<
                    Array<{ totalDocuments: unknown; uploadedLast7Days: unknown }>
                  > {
                    whereCalled = true;
                    return [{ totalDocuments: "9", uploadedLast7Days: "4" }];
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as PostgresJsDatabase;

    const repository = new DrizzleAnalyticsRepository(fakeDb);
    const result: AnalyticsSummary = await repository.getSummary(
      new Date("2026-10-23T12:00:00.000Z"),
    );

    expect(whereCalled).toBe(true);
    expect(result).toEqual({
      totalDocuments: 9,
      uploadedLast7Days: 4,
    });
  });
});
