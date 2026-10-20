import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type {
  DatabaseClient,
  closeDatabase as CloseDatabase,
  createDatabaseClient as CreateDatabaseClient,
} from "@axentra/db";
import type { StorageAdapter } from "@axentra/storage";
import type { AuthUser } from "@axentra/shared";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? test : test.skip;

type DownloadFixture = {
  userId: string;
  userEmail: string;
  categoryId: string;
  documentId: string;
  fileId: string;
};

function createStorageStub(beforeDownloadUrl?: () => Promise<void>): StorageAdapter {
  return {
    initialize: async () => {},
    checkHealth: async () => {},
    putObject: async () => {},
    getObject: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    deleteObject: async () => {},
    headObject: async (key) => ({
      key,
      contentLength: 4,
      contentType: "application/pdf",
      checksumSha256: undefined,
    }),
    createDownloadUrl: async (key, expiresInSeconds = 300) => {
      await beforeDownloadUrl?.();
      return `https://storage.test/${key}?expires=${expiresInSeconds}`;
    },
    close: async () => {},
  };
}

describe("Document Download PostgreSQL integration (BE-S3-02 / BE-S3-04 / AC-09.01)", () => {
  let database: DatabaseClient | undefined;
  let closeDatabase: CloseDatabase;
  let createDatabaseClient: CreateDatabaseClient;

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

  function requireDatabase(): DatabaseClient {
    if (database === undefined) {
      throw new Error("PostgreSQL integration database was not initialized");
    }
    return database;
  }

  async function seedFixture(
    db: DatabaseClient,
    downloadEnabled: boolean,
  ): Promise<DownloadFixture> {
    const schema = await import("@axentra/db");
    const testId = crypto.randomUUID();
    const fixture: DownloadFixture = {
      userId: crypto.randomUUID(),
      userEmail: `test-${testId}@axentra.local`,
      categoryId: crypto.randomUUID(),
      documentId: crypto.randomUUID(),
      fileId: crypto.randomUUID(),
    };

    await db.db.insert(schema.users).values({
      id: fixture.userId,
      email: fixture.userEmail,
      name: "Test User",
      passwordHash: "dummy-hash",
      role: "member_team",
    });
    await db.db.insert(schema.categories).values({
      id: fixture.categoryId,
      name: `Reporting-${testId}`,
      slug: `reporting-${testId}`,
    });
    await db.db.insert(schema.categoryDownloadPermissions).values({
      categoryId: fixture.categoryId,
      downloadEnabled,
    });
    await db.db.insert(schema.documents).values({
      id: fixture.documentId,
      title: `Laporan-${testId}.pdf`,
      categoryId: fixture.categoryId,
      processingStatus: "completed",
    });
    await db.db.insert(schema.documentFiles).values({
      id: fixture.fileId,
      documentId: fixture.documentId,
      storageKey: `documents/${fixture.documentId}/laporan.pdf`,
      originalName: "laporan.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
      fileExtension: "pdf",
    });

    return fixture;
  }

  async function removeFixture(db: DatabaseClient, fixture: DownloadFixture): Promise<void> {
    const schema = await import("@axentra/db");
    await db.db
      .delete(schema.downloadAuditEvents)
      .where(eq(schema.downloadAuditEvents.documentId, fixture.documentId));
    await db.db.delete(schema.documentFiles).where(eq(schema.documentFiles.id, fixture.fileId));
    await db.db.delete(schema.documents).where(eq(schema.documents.id, fixture.documentId));
    await db.db
      .delete(schema.categoryDownloadPermissions)
      .where(eq(schema.categoryDownloadPermissions.categoryId, fixture.categoryId));
    await db.db.delete(schema.categories).where(eq(schema.categories.id, fixture.categoryId));
    await db.db.delete(schema.users).where(eq(schema.users.id, fixture.userId));
  }

  async function countAuditRows(db: DatabaseClient, documentId: string): Promise<number> {
    const schema = await import("@axentra/db");
    const rows = await db.db
      .select()
      .from(schema.downloadAuditEvents)
      .where(eq(schema.downloadAuditEvents.documentId, documentId));
    return rows.length;
  }

  async function waitMs(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  integrationTest(
    "finds download targets and commits the audit row inside the repository transaction",
    async () => {
      const db = requireDatabase();
      const schema = await import("@axentra/db");
      const { DrizzleDownloadRepository } =
        await import("../apps/api/src/modules/documents/download.repository");
      const enabled = await seedFixture(db, true);
      const disabled = await seedFixture(db, false);
      const repo = new DrizzleDownloadRepository(db.db);

      try {
        const targetEnabled = await repo.findDownloadTarget(enabled.documentId);
        expect(targetEnabled?.document.id).toBe(enabled.documentId);
        expect(targetEnabled?.file?.originalName).toBe("laporan.pdf");
        expect(targetEnabled?.file?.fileSize).toBe(1024);
        expect(targetEnabled?.categoryPermission?.downloadEnabled).toBe(true);

        const targetDisabled = await repo.findDownloadTarget(disabled.documentId);
        expect(targetDisabled?.categoryPermission?.downloadEnabled).toBe(false);

        await repo.runInDownloadTransaction(async (scope) => {
          await scope.recordDownloadAuditEvent({
            userId: enabled.userId,
            userName: "Test User",
            userEmail: enabled.userEmail,
            documentId: enabled.documentId,
            documentName: "laporan.pdf",
            downloadedAt: new Date(),
          });
        });

        const rows = await db.db
          .select()
          .from(schema.downloadAuditEvents)
          .where(eq(schema.downloadAuditEvents.documentId, enabled.documentId));
        expect(rows.length).toBe(1);
        expect(rows[0]?.userId).toBe(enabled.userId);
        expect(rows[0]?.userName).toBe("Test User");
        expect(rows[0]?.documentName).toBe("laporan.pdf");
      } finally {
        await removeFixture(db, enabled);
        await removeFixture(db, disabled);
      }
    },
  );

  integrationTest(
    "rolls back the audit row when the transaction fails after recording",
    async () => {
      const db = requireDatabase();
      const { DrizzleDownloadRepository } =
        await import("../apps/api/src/modules/documents/download.repository");
      const fixture = await seedFixture(db, true);
      const repo = new DrizzleDownloadRepository(db.db);

      try {
        await expect(
          repo.runInDownloadTransaction(async (scope) => {
            await scope.recordDownloadAuditEvent({
              userId: fixture.userId,
              userEmail: fixture.userEmail,
              documentId: fixture.documentId,
              documentName: "laporan.pdf",
            });
            throw new Error("forced failure after audit insert");
          }),
        ).rejects.toThrow("forced failure after audit insert");

        expect(await countAuditRows(db, fixture.documentId)).toBe(0);
      } finally {
        await removeFixture(db, fixture);
      }
    },
  );

  integrationTest("records one committed audit row for a successful download", async () => {
    const db = requireDatabase();
    const [{ DrizzleDownloadRepository }, { executeDownloadOperation }] = await Promise.all([
      import("../apps/api/src/modules/documents/download.repository"),
      import("../apps/api/src/modules/documents/download.operations"),
    ]);
    const fixture = await seedFixture(db, true);
    const repo = new DrizzleDownloadRepository(db.db);
    const member: AuthUser = {
      id: fixture.userId,
      email: fixture.userEmail,
      role: "member_team",
      name: "Test User",
    };

    try {
      const result = await executeDownloadOperation(
        { downloadRepository: repo, storage: createStorageStub() },
        { documentId: fixture.documentId, user: member },
      );

      expect(result.kind).toBe("url");
      expect(await countAuditRows(db, fixture.documentId)).toBe(1);

      const schema = await import("@axentra/db");
      const rows = await db.db
        .select()
        .from(schema.downloadAuditEvents)
        .where(eq(schema.downloadAuditEvents.documentId, fixture.documentId));
      expect(rows[0]?.userId).toBe(fixture.userId);
      expect(rows[0]?.userEmail).toBe(fixture.userEmail);
      expect(rows[0]?.documentName).toBe("laporan.pdf");
      expect(rows[0]?.downloadedAt).toBeInstanceOf(Date);
    } finally {
      await removeFixture(db, fixture);
    }
  });

  integrationTest(
    "re-checks permission under lock and writes no audit row when it was revoked during storage I/O",
    async () => {
      const db = requireDatabase();
      const [
        { DrizzleDownloadRepository },
        { executeDownloadOperation },
        { ForbiddenError },
        schema,
      ] = await Promise.all([
        import("../apps/api/src/modules/documents/download.repository"),
        import("../apps/api/src/modules/documents/download.operations"),
        import("../apps/api/src/http/errors"),
        import("@axentra/db"),
      ]);
      const fixture = await seedFixture(db, true);
      const repo = new DrizzleDownloadRepository(db.db);
      const member: AuthUser = {
        id: fixture.userId,
        email: fixture.userEmail,
        role: "member_team",
        name: "Test User",
      };
      // A Head of Team revokes the category while storage is being prepared, outside any transaction.
      const storage = createStorageStub(async () => {
        await db.db
          .update(schema.categoryDownloadPermissions)
          .set({ downloadEnabled: false })
          .where(eq(schema.categoryDownloadPermissions.categoryId, fixture.categoryId));
      });

      try {
        await expect(
          executeDownloadOperation(
            { downloadRepository: repo, storage },
            { documentId: fixture.documentId, user: member },
          ),
        ).rejects.toBeInstanceOf(ForbiddenError);

        expect(await countAuditRows(db, fixture.documentId)).toBe(0);
      } finally {
        await removeFixture(db, fixture);
      }
    },
  );

  integrationTest(
    "holds a share lock on the permission so a concurrent revoke waits for the audit commit",
    async () => {
      const db = requireDatabase();
      const [{ DrizzleDownloadRepository }, schema] = await Promise.all([
        import("../apps/api/src/modules/documents/download.repository"),
        import("@axentra/db"),
      ]);
      const fixture = await seedFixture(db, true);
      const repo = new DrizzleDownloadRepository(db.db);
      const observed = { revokeSettled: false };
      const pending: { revoke?: Promise<void> } = {};

      try {
        await repo.runInDownloadTransaction(async (scope) => {
          const locked = await scope.lockDownloadTarget(fixture.documentId);
          expect(locked?.categoryPermission?.downloadEnabled).toBe(true);

          // A Head of Team revoke issued from another connection while the unit of work is open.
          pending.revoke = db.db
            .update(schema.categoryDownloadPermissions)
            .set({ downloadEnabled: false })
            .where(eq(schema.categoryDownloadPermissions.categoryId, fixture.categoryId))
            .then(() => {
              observed.revokeSettled = true;
            });

          await waitMs(300);
          expect(observed.revokeSettled).toBe(false);

          await scope.recordDownloadAuditEvent({
            userId: fixture.userId,
            userEmail: fixture.userEmail,
            documentId: fixture.documentId,
            documentName: "laporan.pdf",
          });
        });

        await pending.revoke;
        expect(observed.revokeSettled).toBe(true);
        expect(await countAuditRows(db, fixture.documentId)).toBe(1);
      } finally {
        await Promise.allSettled([pending.revoke]);
        await removeFixture(db, fixture);
      }
    },
  );

  integrationTest(
    "holds a share lock on the document so a concurrent soft-delete waits for the audit commit",
    async () => {
      const db = requireDatabase();
      const [{ DrizzleDownloadRepository }, schema] = await Promise.all([
        import("../apps/api/src/modules/documents/download.repository"),
        import("@axentra/db"),
      ]);
      const fixture = await seedFixture(db, true);
      const repo = new DrizzleDownloadRepository(db.db);
      const observed = { deleteSettled: false };
      const pending: { remove?: Promise<void> } = {};

      try {
        await repo.runInDownloadTransaction(async (scope) => {
          const locked = await scope.lockDownloadTarget(fixture.documentId);
          expect(locked?.document.deletedAt).toBeNull();

          // A soft-delete issued from another connection while the unit of work is open.
          pending.remove = db.db
            .update(schema.documents)
            .set({ deletedAt: new Date() })
            .where(eq(schema.documents.id, fixture.documentId))
            .then(() => {
              observed.deleteSettled = true;
            });

          await waitMs(300);
          expect(observed.deleteSettled).toBe(false);

          await scope.recordDownloadAuditEvent({
            userId: fixture.userId,
            userEmail: fixture.userEmail,
            documentId: fixture.documentId,
            documentName: "laporan.pdf",
          });
        });

        await pending.remove;
        expect(observed.deleteSettled).toBe(true);
        expect(await countAuditRows(db, fixture.documentId)).toBe(1);
      } finally {
        await Promise.allSettled([pending.remove]);
        await removeFixture(db, fixture);
      }
    },
  );

  integrationTest(
    "fails closed with a generic error when the audit insert violates a constraint",
    async () => {
      const db = requireDatabase();
      const [{ DrizzleDownloadRepository }, { executeDownloadOperation }, { AppError }] =
        await Promise.all([
          import("../apps/api/src/modules/documents/download.repository"),
          import("../apps/api/src/modules/documents/download.operations"),
          import("../apps/api/src/http/errors"),
        ]);
      const fixture = await seedFixture(db, true);
      const repo = new DrizzleDownloadRepository(db.db);
      // The user id is not in the users table, so the audit insert violates its foreign key.
      const unknownUser: AuthUser = {
        id: crypto.randomUUID(),
        email: `unknown-${crypto.randomUUID()}@axentra.local`,
        role: "member_team",
        name: "Unknown User",
      };

      try {
        let caught: unknown;
        try {
          await executeDownloadOperation(
            { downloadRepository: repo, storage: createStorageStub() },
            { documentId: fixture.documentId, user: unknownUser },
          );
        } catch (thrown: unknown) {
          caught = thrown;
        }

        if (!(caught instanceof AppError)) throw new Error("expected an AppError");
        expect(caught.code).toBe("INTERNAL_ERROR");
        expect(caught.status).toBe(500);
        expect(caught).not.toHaveProperty("params");
        expect(await countAuditRows(db, fixture.documentId)).toBe(0);
      } finally {
        await removeFixture(db, fixture);
      }
    },
  );
});
