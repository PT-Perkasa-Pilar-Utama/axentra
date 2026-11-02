import { describe, expect, it } from "bun:test";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createLogger } from "@axentra/observability";
import {
  permissionCategoriesResponseSchema,
  type ApiErrorEnvelope,
  type PermissionCategory,
} from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import {
  DrizzlePermissionCategoriesRepository,
  InMemoryPermissionCategoriesRepository,
} from "./permission-categories.repository";
import { createPermissionCategoriesService } from "./permission-categories.service";

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

describe("GET /api/v1/permission-categories - Task BE-S4-03 (AC-13.01)", () => {
  it("returns 200 with empty list when no categories exist", async () => {
    const repository = new InMemoryPermissionCategoriesRepository();
    const permissionCategoriesService = createPermissionCategoriesService(repository);
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      permissionCategoriesService,
    });

    const res = await app.request("/api/v1/permission-categories", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-head-token",
      },
    });

    expect(res.status).toBe(200);
    const parsed = permissionCategoriesResponseSchema.parse(await res.json());
    expect(parsed.data).toEqual([]);
  });

  it("returns 200 with categories and download permission status ordered by name for head_of_team", async () => {
    const repository = new InMemoryPermissionCategoriesRepository();
    const permissionCategoriesService = createPermissionCategoriesService(repository);
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      permissionCategoriesService,
    });

    const reporting: PermissionCategory = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Reporting",
      slug: "reporting",
      downloadEnabled: false,
      createdAt: "2026-10-30T08:00:00.000Z",
      updatedAt: "2026-10-30T08:00:00.000Z",
    };
    const contract: PermissionCategory = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Contract",
      slug: "contract",
      downloadEnabled: true,
      createdAt: "2026-10-30T08:05:00.000Z",
      updatedAt: "2026-10-30T08:10:00.000Z",
    };

    repository.categories.set(reporting.id, reporting);
    repository.categories.set(contract.id, contract);

    const res = await app.request("/api/v1/permission-categories", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-head-token",
      },
    });

    expect(res.status).toBe(200);
    const parsed = permissionCategoriesResponseSchema.parse(await res.json());
    expect(parsed.data).toEqual([contract, reporting]);
  });

  it("respects custom limit query parameter", async () => {
    const repository = new InMemoryPermissionCategoriesRepository();
    const permissionCategoriesService = createPermissionCategoriesService(repository);
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      permissionCategoriesService,
    });

    repository.categories.set("11111111-1111-4111-8111-111111111111", {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Reporting",
      slug: "reporting",
      downloadEnabled: false,
      createdAt: "2026-10-30T08:00:00.000Z",
      updatedAt: "2026-10-30T08:00:00.000Z",
    });
    repository.categories.set("22222222-2222-4222-8222-222222222222", {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Contract",
      slug: "contract",
      downloadEnabled: true,
      createdAt: "2026-10-30T08:00:00.000Z",
      updatedAt: "2026-10-30T08:00:00.000Z",
    });

    const res = await app.request("/api/v1/permission-categories?limit=1", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-head-token",
      },
    });

    expect(res.status).toBe(200);
    const parsed = permissionCategoriesResponseSchema.parse(await res.json());
    expect(parsed.data.length).toBe(1);
    expect(parsed.data[0]?.name).toBe("Contract");
  });

  it("returns 400 VALIDATION_ERROR when limit is out of bounds or not an integer", async () => {
    const repository = new InMemoryPermissionCategoriesRepository();
    const permissionCategoriesService = createPermissionCategoriesService(repository);
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      permissionCategoriesService,
    });

    for (const invalidLimit of [
      "0",
      "-1",
      "101",
      "2.5",
      "0x10",
      "1e1",
      "%2010%20",
      "not-a-number",
      "%20%20",
    ]) {
      const res = await app.request(`/api/v1/permission-categories?limit=${invalidLimit}`, {
        method: "GET",
        headers: {
          Authorization: "Bearer valid-head-token",
        },
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ApiErrorEnvelope;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("returns 401 UNAUTHORIZED when Authorization header is missing or invalid", async () => {
    const repository = new InMemoryPermissionCategoriesRepository();
    const permissionCategoriesService = createPermissionCategoriesService(repository);
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      permissionCategoriesService,
    });

    const missingHeaderRes = await app.request("/api/v1/permission-categories", {
      method: "GET",
    });
    expect(missingHeaderRes.status).toBe(401);
    const missingBody = (await missingHeaderRes.json()) as ApiErrorEnvelope;
    expect(missingBody.success).toBe(false);
    expect(missingBody.error.code).toBe("UNAUTHORIZED");

    const invalidTokenRes = await app.request("/api/v1/permission-categories", {
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
    const repository = new InMemoryPermissionCategoriesRepository();
    const permissionCategoriesService = createPermissionCategoriesService(repository);
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      permissionCategoriesService,
    });

    const memberRes = await app.request("/api/v1/permission-categories", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-member-token",
      },
    });
    expect(memberRes.status).toBe(403);
    const memberBody = (await memberRes.json()) as ApiErrorEnvelope;
    expect(memberBody.success).toBe(false);
    expect(memberBody.error.code).toBe("FORBIDDEN");

    const adminRes = await app.request("/api/v1/permission-categories", {
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

  it("defaults downloadEnabled to false in DrizzlePermissionCategoriesRepository when permission row is absent", async () => {
    let appliedLimit = 0;
    const createdAt = new Date("2026-10-30T08:00:00.000Z");
    const updatedAt = new Date("2026-10-30T09:00:00.000Z");

    const fakeDb = {
      select() {
        return {
          from() {
            return {
              leftJoin() {
                return {
                  orderBy() {
                    return {
                      async limit(limitArg: number) {
                        appliedLimit = limitArg;
                        return [
                          {
                            id: "11111111-1111-4111-8111-111111111111",
                            name: "Contract",
                            slug: "contract",
                            downloadEnabled: true,
                            createdAt,
                            updatedAt,
                          },
                          {
                            id: "22222222-2222-4222-8222-222222222222",
                            name: "Reporting",
                            slug: "reporting",
                            downloadEnabled: null,
                            createdAt,
                            updatedAt,
                          },
                        ];
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as PostgresJsDatabase;

    const repository = new DrizzlePermissionCategoriesRepository(fakeDb);
    const result = await repository.listPermissionCategories(250);

    expect(appliedLimit).toBe(100);
    expect(result).toEqual([
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Contract",
        slug: "contract",
        downloadEnabled: true,
        createdAt: "2026-10-30T08:00:00.000Z",
        updatedAt: "2026-10-30T09:00:00.000Z",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Reporting",
        slug: "reporting",
        downloadEnabled: false,
        createdAt: "2026-10-30T08:00:00.000Z",
        updatedAt: "2026-10-30T09:00:00.000Z",
      },
    ]);
  });
});
