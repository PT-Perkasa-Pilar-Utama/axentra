import { describe, expect, it } from "bun:test";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createLogger } from "@axentra/observability";
import {
  adminSummaryResponseSchema,
  type AdminSummary,
  type ApiErrorEnvelope,
} from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { DrizzleAdminRepository, InMemoryAdminRepository } from "./admin.repository";
import { createAdminService } from "./admin.service";

const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const tokenVerifier: TokenVerifier = {
  verifyToken(token: string) {
    if (token === "valid-admin-token") {
      return {
        id: "usr-admin-1",
        email: "admin@axentra.local",
        role: "admin",
        name: "Admin User",
      };
    }
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
    return null;
  },
};

describe("GET /api/v1/admin/summary - Task BE-S4-05 (PROP-ADM-AC-01.01 to 01.03)", () => {
  const fixedNow = new Date("2026-11-05T12:00:00.000Z");

  it("returns 200 with zero counts when no records exist", async () => {
    const repository = new InMemoryAdminRepository();
    const adminService = createAdminService(repository, { now: () => fixedNow });
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      adminService,
    });

    const res = await app.request("/api/v1/admin/summary", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-admin-token",
      },
    });

    expect(res.status).toBe(200);
    const parsed = adminSummaryResponseSchema.parse(await res.json());
    expect(parsed.data).toEqual({
      usersByRole: {
        member_team: 0,
        head_of_team: 0,
        admin: 0,
      },
      totalDocuments: 0,
      uploadedLast7Days: 0,
      downloadCount: 0,
      latestDownloadAt: null,
    });
  });

  it("returns usersByRole counting all accounts including inactive accounts", async () => {
    const repository = new InMemoryAdminRepository();
    const adminService = createAdminService(repository, { now: () => fixedNow });
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      adminService,
    });

    repository.users.set("usr-member-active-1", {
      id: "usr-member-active-1",
      role: "member_team",
      status: "active",
    });
    repository.users.set("usr-member-active-2", {
      id: "usr-member-active-2",
      role: "member_team",
      status: "active",
    });
    repository.users.set("usr-member-inactive", {
      id: "usr-member-inactive",
      role: "member_team",
      status: "inactive",
    });
    repository.users.set("usr-head-active", {
      id: "usr-head-active",
      role: "head_of_team",
      status: "active",
    });
    repository.users.set("usr-admin-active", {
      id: "usr-admin-active",
      role: "admin",
      status: "active",
    });

    const res = await app.request("/api/v1/admin/summary", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-admin-token",
      },
    });

    expect(res.status).toBe(200);
    const parsed = adminSummaryResponseSchema.parse(await res.json());
    expect(parsed.data.usersByRole).toEqual({
      member_team: 3,
      head_of_team: 1,
      admin: 1,
    });
  });

  it("counts totalDocuments and uploadedLast7Days including archived, excluding soft-deleted and fileless", async () => {
    const repository = new InMemoryAdminRepository();
    const adminService = createAdminService(repository, { now: () => fixedNow });
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      adminService,
    });

    // 1. Uploaded 2 days ago, active
    repository.documents.set("doc-recent-1", {
      id: "doc-recent-1",
      createdAt: new Date("2026-11-03T10:00:00.000Z"),
      processingStatus: "completed",
    });

    // 2. Uploaded exact 7 days boundary (2026-10-29T12:00:00.000Z)
    repository.documents.set("doc-boundary-7-days", {
      id: "doc-boundary-7-days",
      createdAt: new Date("2026-10-29T12:00:00.000Z"),
      processingStatus: "completed",
    });

    // 3. Uploaded 1 day ago, archived (still stored, counts in total and 7 days per O7)
    repository.documents.set("doc-recent-archived", {
      id: "doc-recent-archived",
      createdAt: new Date("2026-11-04T08:00:00.000Z"),
      archivedAt: new Date("2026-11-04T12:00:00.000Z"),
      processingStatus: "completed",
    });

    // 4. Uploaded 14 days ago, active (counts in total, not in 7 days)
    repository.documents.set("doc-older", {
      id: "doc-older",
      createdAt: new Date("2026-10-22T00:00:00.000Z"),
      processingStatus: "completed",
    });

    // 5. Uploaded 20 days ago, archived (counts in total, not in 7 days)
    repository.documents.set("doc-older-archived", {
      id: "doc-older-archived",
      createdAt: new Date("2026-10-15T00:00:00.000Z"),
      archivedAt: new Date("2026-10-20T00:00:00.000Z"),
      processingStatus: "completed",
    });

    // 6. Soft-deleted recent document (excluded)
    repository.documents.set("doc-soft-deleted", {
      id: "doc-soft-deleted",
      createdAt: new Date("2026-11-04T01:00:00.000Z"),
      deletedAt: new Date("2026-11-04T02:00:00.000Z"),
      processingStatus: "completed",
    });

    // 7. Fileless document (excluded)
    repository.documents.set("doc-fileless", {
      id: "doc-fileless",
      createdAt: new Date("2026-11-04T01:00:00.000Z"),
      hasFile: false,
      processingStatus: "queued",
    });

    const res = await app.request("/api/v1/admin/summary", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-admin-token",
      },
    });

    expect(res.status).toBe(200);
    const parsed = adminSummaryResponseSchema.parse(await res.json());
    expect(parsed.data.totalDocuments).toBe(5);
    expect(parsed.data.uploadedLast7Days).toBe(3);
  });

  it("returns downloadCount and latestDownloadAt formatted as ISO string", async () => {
    const repository = new InMemoryAdminRepository();
    const adminService = createAdminService(repository, { now: () => fixedNow });
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      adminService,
    });

    repository.downloads.set("dl-1", {
      id: "dl-1",
      downloadedAt: new Date("2026-11-01T08:00:00.000Z"),
    });
    repository.downloads.set("dl-2", {
      id: "dl-2",
      downloadedAt: new Date("2026-11-03T07:46:00.000Z"),
    });
    repository.downloads.set("dl-3", {
      id: "dl-3",
      downloadedAt: new Date("2026-11-02T15:30:00.000Z"),
    });

    const res = await app.request("/api/v1/admin/summary", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-admin-token",
      },
    });

    expect(res.status).toBe(200);
    const parsed = adminSummaryResponseSchema.parse(await res.json());
    expect(parsed.data.downloadCount).toBe(3);
    expect(parsed.data.latestDownloadAt).toBe("2026-11-03T07:46:00.000Z");
  });

  it("returns 401 UNAUTHORIZED when Authorization header is missing or token is invalid", async () => {
    const repository = new InMemoryAdminRepository();
    const adminService = createAdminService(repository, { now: () => fixedNow });
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      adminService,
    });

    const missingHeaderRes = await app.request("/api/v1/admin/summary", {
      method: "GET",
    });
    expect(missingHeaderRes.status).toBe(401);
    const missingBody = (await missingHeaderRes.json()) as ApiErrorEnvelope;
    expect(missingBody.success).toBe(false);
    expect(missingBody.error.code).toBe("UNAUTHORIZED");

    const invalidTokenRes = await app.request("/api/v1/admin/summary", {
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

  it("returns 403 FORBIDDEN when caller role is member_team or head_of_team", async () => {
    const repository = new InMemoryAdminRepository();
    const adminService = createAdminService(repository, { now: () => fixedNow });
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      adminService,
    });

    const memberRes = await app.request("/api/v1/admin/summary", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-member-token",
      },
    });
    expect(memberRes.status).toBe(403);
    const memberBody = (await memberRes.json()) as ApiErrorEnvelope;
    expect(memberBody.success).toBe(false);
    expect(memberBody.error.code).toBe("FORBIDDEN");

    const headRes = await app.request("/api/v1/admin/summary", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-head-token",
      },
    });
    expect(headRes.status).toBe(403);
    const headBody = (await headRes.json()) as ApiErrorEnvelope;
    expect(headBody.success).toBe(false);
    expect(headBody.error.code).toBe("FORBIDDEN");
  });

  it("normalizes numeric and string aggregate results in DrizzleAdminRepository", async () => {
    let selectCount = 0;
    const fakeDb = {
      select() {
        selectCount += 1;
        const currentCount = selectCount;
        return {
          from() {
            if (currentCount === 1) {
              // Documents query
              return {
                innerJoin() {
                  return {
                    async where(): Promise<
                      Array<{ totalDocuments: unknown; uploadedLast7Days: unknown }>
                    > {
                      return [{ totalDocuments: "12", uploadedLast7Days: "4" }];
                    },
                  };
                },
              };
            }
            if (currentCount === 2) {
              // Users query
              return Promise.resolve([
                {
                  memberTeamCount: "10",
                  headOfTeamCount: "3",
                  adminCount: "1",
                },
              ]);
            }
            // Downloads query
            return Promise.resolve([
              {
                downloadCount: "25",
                latestDownloadAt: new Date("2026-11-03T07:46:00.000Z"),
              },
            ]);
          },
        };
      },
    } as unknown as PostgresJsDatabase;

    const repository = new DrizzleAdminRepository(fakeDb);
    const result: AdminSummary = await repository.getSummary(new Date("2026-10-29T12:00:00.000Z"));

    expect(result).toEqual({
      usersByRole: {
        member_team: 10,
        head_of_team: 3,
        admin: 1,
      },
      totalDocuments: 12,
      uploadedLast7Days: 4,
      downloadCount: 25,
      latestDownloadAt: "2026-11-03T07:46:00.000Z",
    });
  });
});
