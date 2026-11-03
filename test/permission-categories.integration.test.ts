import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { asc, eq, inArray, sql } from "drizzle-orm";
import type {
  DatabaseClient,
  closeDatabase as CloseDatabase,
  createDatabaseClient as CreateDatabaseClient,
} from "@axentra/db";
import { createLogger } from "@axentra/observability";
import {
  apiErrorSchema,
  downloadDocumentSuccessResponseSchema,
  permissionCategoriesResponseSchema,
  updatePermissionCategoryResponseSchema,
} from "@axentra/shared";
import { createApp } from "../apps/api/src/app";
import type { TokenVerifier } from "../apps/api/src/middleware/auth";
import { createDocumentService } from "../apps/api/src/modules/documents/documents.service";
import { DrizzleDownloadRepository } from "../apps/api/src/modules/documents/download.repository";
import { DrizzlePermissionCategoriesRepository } from "../apps/api/src/modules/permission-categories/permission-categories.repository";
import { createPermissionCategoriesService } from "../apps/api/src/modules/permission-categories/permission-categories.service";
import {
  assertClientConnectedToDisposableDatabase,
  assertDisposableTestDatabase,
} from "./helpers/disposable-database";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? test : test.skip;

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
        id: "11111111-1111-4111-8111-111111111111",
        email: "head@axentra.local",
        role: "head_of_team",
        name: "Head of Team",
      };
    }
    if (token === "valid-member-token") {
      return {
        id: "22222222-2222-4222-8222-222222222222",
        email: "member@axentra.local",
        role: "member_team",
        name: "Member Team",
      };
    }
    return null;
  },
};

describe("Permission categories API PostgreSQL integration (BE-S4-03, BE-S4-04 / AC-13.01)", () => {
  let database: DatabaseClient | undefined;
  let databaseUrl = "";
  let closeDatabase: typeof CloseDatabase;
  let createDatabaseClient: typeof CreateDatabaseClient;

  beforeAll(async () => {
    if (!runIntegrationTests) return;

    const [{ loadApiConfigFromRuntime }, db] = await Promise.all([
      import("@axentra/config"),
      import("@axentra/db"),
    ]);
    closeDatabase = db.closeDatabase;
    createDatabaseClient = db.createDatabaseClient;
    const config = loadApiConfigFromRuntime();
    assertDisposableTestDatabase(config.DATABASE_URL);
    databaseUrl = config.DATABASE_URL;
    database = createDatabaseClient(config.DATABASE_URL);
    assertClientConnectedToDisposableDatabase(database, databaseUrl);
    await db.checkDatabase(database);
  });

  afterAll(async () => {
    if (database !== undefined) await closeDatabase(database);
  });

  integrationTest(
    "returns categories sorted by name with active, inactive, and default-false download permissions for head_of_team",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const schema = await import("@axentra/db");
      const suffix = crypto.randomUUID();
      const activeCategoryId = crypto.randomUUID();
      const inactiveCategoryId = crypto.randomUUID();
      const unconfiguredCategoryId = crypto.randomUUID();
      const categoryIds = [activeCategoryId, inactiveCategoryId, unconfiguredCategoryId];

      const activeName = `00-PermCat-Active-${suffix}`;
      const inactiveName = `00-PermCat-Inactive-${suffix}`;
      const unconfiguredName = `00-PermCat-Unconfigured-${suffix}`;

      try {
        await database.db.insert(schema.categories).values([
          {
            id: inactiveCategoryId,
            name: inactiveName,
            slug: `permcat-inactive-${suffix}`,
          },
          {
            id: unconfiguredCategoryId,
            name: unconfiguredName,
            slug: `permcat-unconfigured-${suffix}`,
          },
          {
            id: activeCategoryId,
            name: activeName,
            slug: `permcat-active-${suffix}`,
          },
        ]);

        await database.db.insert(schema.categoryDownloadPermissions).values([
          {
            categoryId: activeCategoryId,
            downloadEnabled: true,
          },
          {
            categoryId: inactiveCategoryId,
            downloadEnabled: false,
          },
        ]);

        const app = createApp({
          logger: testLogger,
          version: "0.1.0",
          readinessChecks: [],
          tokenVerifier,
          permissionCategoriesService: createPermissionCategoriesService(
            new DrizzlePermissionCategoriesRepository(database.db),
          ),
        });

        const res = await app.request("/api/v1/permission-categories?limit=100", {
          method: "GET",
          headers: {
            Authorization: "Bearer valid-head-token",
          },
        });

        expect(res.status).toBe(200);
        const body = permissionCategoriesResponseSchema.parse(await res.json());

        const matching = body.data.filter((item) => categoryIds.includes(item.id));
        expect(matching.map((item) => item.name)).toEqual([
          activeName,
          inactiveName,
          unconfiguredName,
        ]);
        expect(matching.map((item) => item.downloadEnabled)).toEqual([true, false, false]);

        const memberRes = await app.request("/api/v1/permission-categories", {
          method: "GET",
          headers: {
            Authorization: "Bearer valid-member-token",
          },
        });
        expect(memberRes.status).toBe(403);
        const memberBody = apiErrorSchema.parse(await memberRes.json());
        expect(memberBody.error.code).toBe("FORBIDDEN");
      } finally {
        assertDisposableTestDatabase(databaseUrl);
        assertClientConnectedToDisposableDatabase(database, databaseUrl);
        await database.db
          .delete(schema.categories)
          .where(inArray(schema.categories.id, categoryIds));
      }
    },
  );

  integrationTest(
    "toggles category download permission via PATCH /api/v1/permission-categories/:categoryId and gates member_team document download",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const schema = await import("@axentra/db");
      const suffix = crypto.randomUUID();
      const headUserId = crypto.randomUUID();
      const memberUserId = crypto.randomUUID();
      const reportingCategoryId = crypto.randomUUID();
      const missingCategoryId = crypto.randomUUID();
      const documentId = crypto.randomUUID();
      const fileId = crypto.randomUUID();

      try {
        await database.db.insert(schema.users).values([
          {
            id: headUserId,
            email: `permcat-head-${suffix}@axentra.local`,
            name: "Head of Team",
            passwordHash: "dummy-hash",
            role: "head_of_team",
          },
          {
            id: memberUserId,
            email: `permcat-member-${suffix}@axentra.local`,
            name: "Member Team",
            passwordHash: "dummy-hash",
            role: "member_team",
          },
        ]);

        await database.db.insert(schema.categories).values({
          id: reportingCategoryId,
          name: `00-PermCat-Reporting-${suffix}`,
          slug: `permcat-reporting-${suffix}`,
        });

        await database.db.insert(schema.documents).values({
          id: documentId,
          title: `Laporan-${suffix}.pdf`,
          categoryId: reportingCategoryId,
          processingStatus: "completed",
        });

        await database.db.insert(schema.documentFiles).values({
          id: fileId,
          documentId,
          storageKey: `documents/${documentId}/Laporan-${suffix}.pdf`,
          originalName: `Laporan-${suffix}.pdf`,
          mimeType: "application/pdf",
          fileSize: 128,
          fileExtension: "pdf",
        });

        const app = createApp({
          logger: testLogger,
          version: "0.1.0",
          readinessChecks: [],
          tokenVerifier: {
            verifyToken(token: string) {
              if (token === "valid-head-token") {
                return {
                  id: headUserId,
                  email: `permcat-head-${suffix}@axentra.local`,
                  role: "head_of_team",
                  name: "Head of Team",
                };
              }
              if (token === "valid-member-token") {
                return {
                  id: memberUserId,
                  email: `permcat-member-${suffix}@axentra.local`,
                  role: "member_team",
                  name: "Member Team",
                };
              }
              return null;
            },
          },
          documentService: createDocumentService({
            downloadRepository: new DrizzleDownloadRepository(database.db),
          }),
          permissionCategoriesService: createPermissionCategoriesService(
            new DrizzlePermissionCategoriesRepository(database.db),
          ),
        });

        const deniedBeforeToggle = await app.request(`/api/v1/documents/${documentId}/download`, {
          method: "GET",
          headers: {
            Authorization: "Bearer valid-member-token",
          },
        });
        expect(deniedBeforeToggle.status).toBe(403);

        const activateRes = await app.request(
          `/api/v1/permission-categories/${reportingCategoryId}`,
          {
            method: "PATCH",
            headers: {
              Authorization: "Bearer valid-head-token",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ downloadEnabled: true }),
          },
        );
        expect(activateRes.status).toBe(200);
        const activated = updatePermissionCategoryResponseSchema.parse(await activateRes.json());
        expect(activated.data.id).toBe(reportingCategoryId);
        expect(activated.data.downloadEnabled).toBe(true);

        const client = database;
        const readPermissionRows = async (): Promise<
          ReadonlyArray<{ id: string; downloadEnabled: boolean }>
        > =>
          client.db
            .select({
              id: schema.categoryDownloadPermissions.id,
              downloadEnabled: schema.categoryDownloadPermissions.downloadEnabled,
            })
            .from(schema.categoryDownloadPermissions)
            .where(eq(schema.categoryDownloadPermissions.categoryId, reportingCategoryId));

        // The first toggle inserts the permission row because none existed.
        const rowsAfterActivate = await readPermissionRows();
        expect(rowsAfterActivate).toHaveLength(1);
        expect(rowsAfterActivate[0]?.downloadEnabled).toBe(true);

        const readPermissionAuditRows = async () =>
          client.db
            .select()
            .from(schema.categoryPermissionAuditEvents)
            .where(eq(schema.categoryPermissionAuditEvents.categoryId, reportingCategoryId))
            .orderBy(schema.categoryPermissionAuditEvents.changedAt);

        const auditAfterActivate = await readPermissionAuditRows();
        expect(auditAfterActivate).toHaveLength(1);
        expect(auditAfterActivate[0]?.categoryName).toBe(`00-PermCat-Reporting-${suffix}`);
        expect(auditAfterActivate[0]?.previousDownloadEnabled).toBeNull();
        expect(auditAfterActivate[0]?.newDownloadEnabled).toBe(true);
        expect(auditAfterActivate[0]?.userId).toBe(headUserId);
        expect(auditAfterActivate[0]?.userName).toBe("Head of Team");
        expect(auditAfterActivate[0]?.userEmail).toBe(`permcat-head-${suffix}@axentra.local`);

        const allowedAfterActivate = await app.request(`/api/v1/documents/${documentId}/download`, {
          method: "GET",
          headers: {
            Authorization: "Bearer valid-member-token",
          },
        });
        expect(allowedAfterActivate.status).toBe(200);
        const downloadBody = downloadDocumentSuccessResponseSchema.parse(
          await allowedAfterActivate.json(),
        );
        expect(downloadBody.data.filename).toBe(`Laporan-${suffix}.pdf`);

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
        const deactivated = updatePermissionCategoryResponseSchema.parse(
          await deactivateRes.json(),
        );
        expect(deactivated.data.downloadEnabled).toBe(false);

        // The second toggle updates the same row through the unique category_id conflict.
        const rowsAfterDeactivate = await readPermissionRows();
        expect(rowsAfterDeactivate).toHaveLength(1);
        expect(rowsAfterDeactivate[0]?.id).toBe(rowsAfterActivate[0]?.id);
        expect(rowsAfterDeactivate[0]?.downloadEnabled).toBe(false);

        const auditAfterDeactivate = await readPermissionAuditRows();
        expect(auditAfterDeactivate).toHaveLength(2);
        expect(auditAfterDeactivate[1]?.previousDownloadEnabled).toBe(true);
        expect(auditAfterDeactivate[1]?.newDownloadEnabled).toBe(false);
        expect(auditAfterDeactivate[1]?.userId).toBe(headUserId);

        const deniedAfterDeactivate = await app.request(
          `/api/v1/documents/${documentId}/download`,
          {
            method: "GET",
            headers: {
              Authorization: "Bearer valid-member-token",
            },
          },
        );
        expect(deniedAfterDeactivate.status).toBe(403);

        const notFoundRes = await app.request(
          `/api/v1/permission-categories/${missingCategoryId}`,
          {
            method: "PATCH",
            headers: {
              Authorization: "Bearer valid-head-token",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ downloadEnabled: true }),
          },
        );
        expect(notFoundRes.status).toBe(404);
        const notFoundBody = apiErrorSchema.parse(await notFoundRes.json());
        expect(notFoundBody.error.code).toBe("NOT_FOUND");

        const orphanRows = await database.db
          .select({ id: schema.categoryDownloadPermissions.id })
          .from(schema.categoryDownloadPermissions)
          .where(eq(schema.categoryDownloadPermissions.categoryId, missingCategoryId));
        expect(orphanRows).toHaveLength(0);

        const orphanAuditRows = await database.db
          .select({ id: schema.categoryPermissionAuditEvents.id })
          .from(schema.categoryPermissionAuditEvents)
          .where(eq(schema.categoryPermissionAuditEvents.categoryId, missingCategoryId));
        expect(orphanAuditRows).toHaveLength(0);
      } finally {
        assertDisposableTestDatabase(databaseUrl);
        assertClientConnectedToDisposableDatabase(database, databaseUrl);
        await database.db
          .delete(schema.categoryPermissionAuditEvents)
          .where(eq(schema.categoryPermissionAuditEvents.categoryId, reportingCategoryId));
        await database.db
          .delete(schema.downloadAuditEvents)
          .where(eq(schema.downloadAuditEvents.documentId, documentId));
        await database.db.delete(schema.documents).where(eq(schema.documents.id, documentId));
        await database.db
          .delete(schema.categories)
          .where(eq(schema.categories.id, reportingCategoryId));
        await database.db
          .delete(schema.users)
          .where(inArray(schema.users.id, [headUserId, memberUserId]));
      }
    },
  );

  integrationTest(
    "serializes overlapping PATCH requests on the same category and preserves consistent previous -> new audit trail (F5)",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const schema = await import("@axentra/db");
      const suffix = crypto.randomUUID();
      const headUserId = crypto.randomUUID();
      const categoryId = crypto.randomUUID();

      try {
        await database.db.insert(schema.users).values({
          id: headUserId,
          email: `permcat-concurrent-${suffix}@axentra.local`,
          name: "Head of Team Concurrent",
          passwordHash: "dummy-hash",
          role: "head_of_team",
        });

        await database.db.insert(schema.categories).values({
          id: categoryId,
          name: `00-PermCat-Concurrent-${suffix}`,
          slug: `permcat-concurrent-${suffix}`,
        });

        // Set initial permission state: true
        await database.db.insert(schema.categoryDownloadPermissions).values({
          categoryId,
          downloadEnabled: true,
        });

        const app = createApp({
          logger: testLogger,
          version: "0.1.0",
          readinessChecks: [],
          tokenVerifier: {
            verifyToken(token: string) {
              if (token === "valid-head-token") {
                return {
                  id: headUserId,
                  email: `permcat-concurrent-${suffix}@axentra.local`,
                  role: "head_of_team",
                  name: "Head of Team Concurrent",
                };
              }
              return null;
            },
          },
          permissionCategoriesService: createPermissionCategoriesService(
            new DrizzlePermissionCategoriesRepository(database.db),
          ),
        });

        // Acquire an exclusive lock on the category using a separate transaction T_gate.
        // This holds the category locked so that any incoming PATCH requests are forced to queue
        // on the category lock concurrently, deterministically guaranteeing an overlap.
        let gateHasLock = false;
        let gateCanCommit = false;

        const gatePromise = database.db.transaction(async (tx) => {
          await tx.execute(sql`SELECT id FROM categories WHERE id = ${categoryId} FOR UPDATE`);
          gateHasLock = true;
          while (!gateCanCommit) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        });

        // Wait until T_gate has acquired the exclusive lock
        while (!gateHasLock) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }

        // Fire both PATCH requests concurrently while T_gate holds the lock:
        // Both requests attempt to set downloadEnabled: false concurrently.
        const patchAPromise = app.request(`/api/v1/permission-categories/${categoryId}`, {
          method: "PATCH",
          headers: {
            Authorization: "Bearer valid-head-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ downloadEnabled: false }),
        });

        const patchBPromise = app.request(`/api/v1/permission-categories/${categoryId}`, {
          method: "PATCH",
          headers: {
            Authorization: "Bearer valid-head-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ downloadEnabled: false }),
        });

        // Poll pg_stat_activity until at least 2 backend transactions are blocked waiting on Lock
        // to guarantee deterministic overlap before releasing the gate lock.
        const startTime = Date.now();
        const timeoutMs = 5000;
        let waitingCount = 0;
        while (Date.now() - startTime < timeoutMs) {
          const [lockStats] = await database.db.execute<{ count: number }>(sql`
            SELECT count(*)::int as count
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND wait_event_type = 'Lock'
              AND pid <> pg_backend_pid()
          `);
          waitingCount = Number(lockStats?.count ?? 0);
          if (waitingCount >= 2) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        expect(waitingCount).toBeGreaterThanOrEqual(2);

        // Record the gate release time.
        // Under normal clock conditions, clock_timestamp() evaluated after acquiring the category lock
        // guarantees that both audit event timestamps are >= gateReleaseTime.
        const gateReleaseTime = new Date();
        gateCanCommit = true;
        await gatePromise;

        const [resA, resB] = await Promise.all([patchAPromise, patchBPromise]);
        expect(resA.status).toBe(200);
        expect(resB.status).toBe(200);

        const auditEvents = await database.db
          .select()
          .from(schema.categoryPermissionAuditEvents)
          .where(eq(schema.categoryPermissionAuditEvents.categoryId, categoryId))
          .orderBy(asc(schema.categoryPermissionAuditEvents.changedAt));

        expect(auditEvents).toHaveLength(2);

        const firstChangedAt = auditEvents[0]?.changedAt.getTime();
        const secondChangedAt = auditEvents[1]?.changedAt.getTime();
        expect(firstChangedAt).toBeDefined();
        expect(secondChangedAt).toBeDefined();

        // Under normal clock conditions, clock_timestamp() evaluated after acquiring row locks
        // ensures both events are recorded after gate release and in chronological serialization order.
        expect(firstChangedAt).toBeGreaterThanOrEqual(gateReleaseTime.getTime());
        expect(secondChangedAt).toBeGreaterThan(firstChangedAt ?? 0);

        // The first event must start from the initial state: true.
        expect(auditEvents[0]?.previousDownloadEnabled).toBe(true);
        expect(auditEvents[0]?.newDownloadEnabled).toBe(false);

        // The second event must read previous state AFTER the first event commits (false -> false),
        // proving row lock serialization worked and previous state was read after acquiring the lock.
        expect(auditEvents[1]?.previousDownloadEnabled).toBe(false);
        expect(auditEvents[1]?.previousDownloadEnabled).toBe(auditEvents[0]?.newDownloadEnabled);
        expect(auditEvents[1]?.newDownloadEnabled).toBe(false);

        // The final state in category_download_permissions must match the second audit event's new state.
        const [finalPermission] = await database.db
          .select()
          .from(schema.categoryDownloadPermissions)
          .where(eq(schema.categoryDownloadPermissions.categoryId, categoryId));
        expect(finalPermission?.downloadEnabled).toBe(false);
        expect(finalPermission?.downloadEnabled).toBe(auditEvents[1]?.newDownloadEnabled);
      } finally {
        assertDisposableTestDatabase(databaseUrl);
        assertClientConnectedToDisposableDatabase(database, databaseUrl);
        await database.db
          .delete(schema.categoryPermissionAuditEvents)
          .where(eq(schema.categoryPermissionAuditEvents.categoryId, categoryId));
        await database.db
          .delete(schema.categoryDownloadPermissions)
          .where(eq(schema.categoryDownloadPermissions.categoryId, categoryId));
        await database.db.delete(schema.categories).where(eq(schema.categories.id, categoryId));
        await database.db.delete(schema.users).where(eq(schema.users.id, headUserId));
      }
    },
  );
});
