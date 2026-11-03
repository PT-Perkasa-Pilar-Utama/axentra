import { describe, expect, it } from "bun:test";
import { createLogger } from "@axentra/observability";
import {
  PERMISSION_CATEGORIES_DEFAULT_LIMIT,
  PERMISSION_CATEGORIES_MAX_LIMIT,
  apiErrorSchema,
  permissionCategoriesResponseSchema,
  updatePermissionCategoryResponseSchema,
  type PermissionCategory,
} from "@axentra/shared";
import { createApp } from "../../app";
import { NotFoundError } from "../../http/errors";
import type { TokenVerifier } from "../../middleware/auth";
import {
  InMemoryPermissionCategoriesRepository,
  resolvePermissionCategoriesLimit,
  toPermissionCategory,
  type IPermissionCategoriesRepository,
  type UpdateCategoryPermissionActor,
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
      const body = apiErrorSchema.parse(await res.json());
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
    const missingBody = apiErrorSchema.parse(await missingHeaderRes.json());
    expect(missingBody.success).toBe(false);
    expect(missingBody.error.code).toBe("UNAUTHORIZED");

    const invalidTokenRes = await app.request("/api/v1/permission-categories", {
      method: "GET",
      headers: {
        Authorization: "Bearer unknown-token",
      },
    });
    expect(invalidTokenRes.status).toBe(401);
    const invalidBody = apiErrorSchema.parse(await invalidTokenRes.json());
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
    const memberBody = apiErrorSchema.parse(await memberRes.json());
    expect(memberBody.success).toBe(false);
    expect(memberBody.error.code).toBe("FORBIDDEN");

    const adminRes = await app.request("/api/v1/permission-categories", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-admin-token",
      },
    });
    expect(adminRes.status).toBe(403);
    const adminBody = apiErrorSchema.parse(await adminRes.json());
    expect(adminBody.success).toBe(false);
    expect(adminBody.error.code).toBe("FORBIDDEN");
  });

  it("defaults downloadEnabled to false when the permission row is absent", () => {
    const createdAt = new Date("2026-10-30T08:00:00.000Z");
    const updatedAt = new Date("2026-10-30T09:00:00.000Z");

    expect(
      [
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
      ].map(toPermissionCategory),
    ).toEqual([
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

  it("clamps the repository limit to 1..PERMISSION_CATEGORIES_MAX_LIMIT", () => {
    expect(resolvePermissionCategoriesLimit()).toBe(PERMISSION_CATEGORIES_DEFAULT_LIMIT);
    expect(resolvePermissionCategoriesLimit(0)).toBe(1);
    expect(resolvePermissionCategoriesLimit(250)).toBe(PERMISSION_CATEGORIES_MAX_LIMIT);
    expect(resolvePermissionCategoriesLimit(25)).toBe(25);
  });
});

// Extends the in-memory repository so the compiler checks it against the port without a cast.
class RecordingPermissionCategoriesRepository extends InMemoryPermissionCategoriesRepository {
  public transactionCount = 0;
  public rolledBack = 0;
  public updatesInsideTransaction = 0;
  public updatesOutsideTransaction = 0;
  private inTransaction = false;

  public override async updateCategoryDownloadPermission(
    categoryId: string,
    downloadEnabled: boolean,
    actor?: UpdateCategoryPermissionActor,
  ): Promise<PermissionCategory | null> {
    if (this.inTransaction) this.updatesInsideTransaction += 1;
    else this.updatesOutsideTransaction += 1;
    return super.updateCategoryDownloadPermission(categoryId, downloadEnabled, actor);
  }

  public override async transaction<T>(
    callback: (txRepo: IPermissionCategoriesRepository) => Promise<T>,
  ): Promise<T> {
    this.transactionCount += 1;
    this.inTransaction = true;
    try {
      return await super.transaction(callback);
    } catch (error: unknown) {
      this.rolledBack += 1;
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }
}

describe("PATCH /api/v1/permission-categories/:categoryId - Task BE-S4-04 (AC-13.01)", () => {
  const reportingCategoryId = "11111111-1111-4111-8111-111111111111";

  it("toggles category download permission from inactive to active and back to inactive for head_of_team", async () => {
    const repository = new InMemoryPermissionCategoriesRepository();
    const permissionCategoriesService = createPermissionCategoriesService(repository);
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      permissionCategoriesService,
    });

    repository.categories.set(reportingCategoryId, {
      id: reportingCategoryId,
      name: "Reporting",
      slug: "reporting",
      downloadEnabled: false,
      createdAt: "2026-10-30T08:00:00.000Z",
      updatedAt: "2026-10-30T08:00:00.000Z",
    });

    const activateRes = await app.request(`/api/v1/permission-categories/${reportingCategoryId}`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer valid-head-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ downloadEnabled: true }),
    });

    expect(activateRes.status).toBe(200);
    const activated = updatePermissionCategoryResponseSchema.parse(await activateRes.json());
    expect(activated.data.id).toBe(reportingCategoryId);
    expect(activated.data.name).toBe("Reporting");
    expect(activated.data.slug).toBe("reporting");
    expect(activated.data.downloadEnabled).toBe(true);
    expect(Date.parse(activated.data.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse("2026-10-30T08:00:00.000Z"),
    );

    const listRes = await app.request("/api/v1/permission-categories", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-head-token",
      },
    });
    expect(listRes.status).toBe(200);
    const listed = permissionCategoriesResponseSchema.parse(await listRes.json());
    expect(listed.data[0]?.downloadEnabled).toBe(true);

    const deactivateRes = await app.request(
      `/api/v1/permission-categories/${reportingCategoryId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer valid-head-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ downloadEnabled: false }),
      },
    );

    expect(deactivateRes.status).toBe(200);
    const deactivated = updatePermissionCategoryResponseSchema.parse(await deactivateRes.json());
    expect(deactivated.data.downloadEnabled).toBe(false);

    expect(repository.auditEvents).toHaveLength(2);
    expect(repository.auditEvents[0]).toMatchObject({
      categoryId: reportingCategoryId,
      categoryName: "Reporting",
      previousDownloadEnabled: false,
      newDownloadEnabled: true,
      userId: "usr-head-1",
      userName: "Head of Team User",
      userEmail: "head@axentra.local",
    });
    expect(repository.auditEvents[1]).toMatchObject({
      categoryId: reportingCategoryId,
      categoryName: "Reporting",
      previousDownloadEnabled: true,
      newDownloadEnabled: false,
      userId: "usr-head-1",
      userName: "Head of Team User",
      userEmail: "head@axentra.local",
    });
  });

  it("returns 404 NOT_FOUND when categoryId does not exist", async () => {
    const repository = new InMemoryPermissionCategoriesRepository();
    const permissionCategoriesService = createPermissionCategoriesService(repository);
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      permissionCategoriesService,
    });

    const res = await app.request(
      "/api/v1/permission-categories/99999999-9999-4999-8999-999999999999",
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer valid-head-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ downloadEnabled: true }),
      },
    );

    expect(res.status).toBe(404);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Kategori tidak ditemukan");
    expect(repository.auditEvents).toHaveLength(0);
  });

  it("returns 400 VALIDATION_ERROR when categoryId is not a valid UUID", async () => {
    const repository = new InMemoryPermissionCategoriesRepository();
    const permissionCategoriesService = createPermissionCategoriesService(repository);
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      permissionCategoriesService,
    });

    const res = await app.request("/api/v1/permission-categories/not-a-valid-uuid", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer valid-head-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ downloadEnabled: true }),
    });

    expect(res.status).toBe(400);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details?.[0]?.field).toBe("categoryId");
  });

  it("returns 400 VALIDATION_ERROR for invalid, missing, non-boolean, or unknown body fields", async () => {
    const repository = new InMemoryPermissionCategoriesRepository();
    const permissionCategoriesService = createPermissionCategoriesService(repository);
    const app = createApp({
      logger: testLogger,
      version: "0.1.0",
      readinessChecks: [],
      tokenVerifier,
      permissionCategoriesService,
    });

    repository.categories.set(reportingCategoryId, {
      id: reportingCategoryId,
      name: "Reporting",
      slug: "reporting",
      downloadEnabled: false,
      createdAt: "2026-10-30T08:00:00.000Z",
      updatedAt: "2026-10-30T08:00:00.000Z",
    });

    const invalidPayloads = [
      "{malformed-json",
      "",
      JSON.stringify({}),
      JSON.stringify({ downloadEnabled: "true" }),
      JSON.stringify({ downloadEnabled: 1 }),
      JSON.stringify({ downloadEnabled: null }),
      JSON.stringify({ downloadEnabled: true, extraField: "not-allowed" }),
    ];

    for (const rawPayload of invalidPayloads) {
      const res = await app.request(`/api/v1/permission-categories/${reportingCategoryId}`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer valid-head-token",
          "Content-Type": "application/json",
        },
        body: rawPayload,
      });

      expect(res.status).toBe(400);
      const body = apiErrorSchema.parse(await res.json());
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

    const missingHeaderRes = await app.request(
      `/api/v1/permission-categories/${reportingCategoryId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ downloadEnabled: true }),
      },
    );
    expect(missingHeaderRes.status).toBe(401);
    const missingBody = apiErrorSchema.parse(await missingHeaderRes.json());
    expect(missingBody.error.code).toBe("UNAUTHORIZED");

    const invalidTokenRes = await app.request(
      `/api/v1/permission-categories/${reportingCategoryId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer invalid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ downloadEnabled: true }),
      },
    );
    expect(invalidTokenRes.status).toBe(401);
    const invalidBody = apiErrorSchema.parse(await invalidTokenRes.json());
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

    repository.categories.set(reportingCategoryId, {
      id: reportingCategoryId,
      name: "Reporting",
      slug: "reporting",
      downloadEnabled: false,
      createdAt: "2026-10-30T08:00:00.000Z",
      updatedAt: "2026-10-30T08:00:00.000Z",
    });

    for (const token of ["valid-member-token", "valid-admin-token"]) {
      const res = await app.request(`/api/v1/permission-categories/${reportingCategoryId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ downloadEnabled: true }),
      });

      expect(res.status).toBe(403);
      const body = apiErrorSchema.parse(await res.json());
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
    }

    expect(repository.categories.get(reportingCategoryId)?.downloadEnabled).toBe(false);
  });

  it("runs the update inside one repository transaction", async () => {
    const repository = new RecordingPermissionCategoriesRepository();
    repository.categories.set(reportingCategoryId, {
      id: reportingCategoryId,
      name: "Reporting",
      slug: "reporting",
      downloadEnabled: false,
      createdAt: "2026-10-30T08:00:00.000Z",
      updatedAt: "2026-10-30T08:00:00.000Z",
    });
    const service = createPermissionCategoriesService(repository);

    const updated = await service.updateCategoryDownloadPermission(reportingCategoryId, true);

    expect(repository.transactionCount).toBe(1);
    expect(repository.updatesInsideTransaction).toBe(1);
    expect(repository.updatesOutsideTransaction).toBe(0);
    expect(updated.downloadEnabled).toBe(true);
    expect(updated.createdAt).toBe("2026-10-30T08:00:00.000Z");
  });

  it("throws NotFoundError inside the transaction and leaves state unchanged when the category is absent", async () => {
    const repository = new RecordingPermissionCategoriesRepository();
    const service = createPermissionCategoriesService(repository);

    await expect(
      service.updateCategoryDownloadPermission(reportingCategoryId, true),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.transactionCount).toBe(1);
    expect(repository.rolledBack).toBe(1);
    expect(repository.categories.size).toBe(0);
    expect(repository.auditEvents).toHaveLength(0);
  });
});
