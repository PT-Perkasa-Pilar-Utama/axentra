import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import type {
  DatabaseClient,
  closeDatabase as CloseDatabase,
  createDatabaseClient as CreateDatabaseClient,
} from "@axentra/db";
import { createLogger } from "@axentra/observability";
import { downloadAuditListResponseSchema } from "@axentra/shared";
import { createApp } from "../apps/api/src/app";
import type { TokenVerifier } from "../apps/api/src/middleware/auth";
import { DrizzleAuditRepository } from "../apps/api/src/modules/audit/audit.repository";
import { createAuditService } from "../apps/api/src/modules/audit/audit.service";

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
    return null;
  },
};

describe("Download audit trail API PostgreSQL integration (BE-S4-02 / AC-12.01)", () => {
  let database: DatabaseClient | undefined;
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
    database = createDatabaseClient(config.DATABASE_URL);
    await db.checkDatabase(database);
  });

  afterAll(async () => {
    if (database !== undefined) await closeDatabase(database);
  });

  integrationTest(
    "returns newest-first download events, resolves missing user snapshots via LEFT JOIN, and preserves history after document deletion",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const schema = await import("@axentra/db");
      const suffix = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const documentOneId = crypto.randomUUID();
      const documentTwoId = crypto.randomUUID();
      const eventOneId = crypto.randomUUID();
      const eventTwoId = crypto.randomUUID();

      try {
        await database.db.insert(schema.users).values({
          id: userId,
          email: `audit-read-${suffix}@axentra.local`,
          name: `Rina ${suffix}`,
          passwordHash: "dummy-hash",
          role: "member_team",
        });

        await database.db.insert(schema.documents).values([
          {
            id: documentOneId,
            title: `Dokumen Satu ${suffix}`,
            processingStatus: "completed",
          },
          {
            id: documentTwoId,
            title: `Dokumen Dua ${suffix}`,
            processingStatus: "completed",
          },
        ]);

        const olderDate = new Date("2099-01-01T10:00:00.000Z");
        const newerDate = new Date("2099-01-01T11:00:00.000Z");

        await database.db.insert(schema.downloadAuditEvents).values([
          {
            id: eventOneId,
            userId,
            userName: null,
            userEmail: null,
            documentId: documentOneId,
            documentName: `laporan-satu-${suffix}.pdf`,
            downloadedAt: olderDate,
          },
          {
            id: eventTwoId,
            userId,
            userName: `Snapshot ${suffix}`,
            userEmail: `snapshot-${suffix}@axentra.local`,
            documentId: documentTwoId,
            documentName: `laporan-dua-${suffix}.pdf`,
            downloadedAt: newerDate,
          },
        ]);

        // Deleting the second document sets document_id to NULL on its audit row while keeping document_name.
        await database.db.delete(schema.documents).where(eq(schema.documents.id, documentTwoId));

        const app = createApp({
          logger: testLogger,
          version: "0.1.0",
          readinessChecks: [],
          tokenVerifier,
          auditService: createAuditService(new DrizzleAuditRepository(database.db)),
        });

        const res = await app.request("/api/v1/audit/downloads?page=1&limit=2", {
          method: "GET",
          headers: {
            Authorization: "Bearer valid-head-token",
          },
        });

        expect(res.status).toBe(200);
        const body = downloadAuditListResponseSchema.parse(await res.json());
        expect(body.meta.page).toBe(1);
        expect(body.meta.limit).toBe(2);
        expect(body.meta.total).toBeGreaterThanOrEqual(2);

        const first = body.data[0];
        const second = body.data[1];
        expect(first?.id).toBe(eventTwoId);
        expect(first?.documentId).toBeNull();
        expect(first?.documentName).toBe(`laporan-dua-${suffix}.pdf`);
        expect(first?.userName).toBe(`Snapshot ${suffix}`);
        expect(first?.downloadedAt).toBe(newerDate.toISOString());

        expect(second?.id).toBe(eventOneId);
        expect(second?.documentId).toBe(documentOneId);
        expect(second?.documentName).toBe(`laporan-satu-${suffix}.pdf`);
        expect(second?.userName).toBe(`Rina ${suffix}`);
        expect(second?.userEmail).toBe(`audit-read-${suffix}@axentra.local`);
        expect(second?.downloadedAt).toBe(olderDate.toISOString());
      } finally {
        await database.db
          .delete(schema.downloadAuditEvents)
          .where(inArray(schema.downloadAuditEvents.id, [eventOneId, eventTwoId]));
        await database.db
          .delete(schema.documents)
          .where(inArray(schema.documents.id, [documentOneId, documentTwoId]));
        await database.db.delete(schema.users).where(eq(schema.users.id, userId));
      }
    },
  );
});
