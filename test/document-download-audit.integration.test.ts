import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
import type { StorageAdapter } from "@axentra/storage";
import type { AuthUser } from "@axentra/shared";
import type {
  CreateDownloadAuditEventInput,
  DocumentCategoryPermissionStatus,
  DownloadTargetRecord,
  IDownloadRepository,
} from "../apps/api/src/modules/documents/download.repository";
import type {
  DatabaseClient,
  closeDatabase as CloseDatabase,
  createDatabaseClient as CreateDatabaseClient,
  documents as documentsTable,
} from "@axentra/db";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? test : test.skip;

const FILE_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

type Fixture = {
  userId: string;
  userEmail: string;
  categoryId: string;
  documentIds: [string, string];
};

function memberOf(fixture: Fixture): AuthUser {
  return {
    id: fixture.userId,
    email: fixture.userEmail,
    role: "member_team",
    name: "Audit Test User",
  };
}

// True when the error, or its cause, is PostgreSQL's lock_not_available (55P03) or its message.
// Every value is narrowed from unknown, so nothing is read through an any-typed accessor.
function isLockNotAvailable(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined;
  const failures = [error, cause].filter(
    (value): value is object => typeof value === "object" && value !== null,
  );
  return failures.some((failure) => {
    if ("code" in failure && failure.code === "55P03") return true;
    return (
      failure instanceof Error && failure.message.toLowerCase().includes("could not obtain lock")
    );
  });
}

async function captureError(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error: unknown) {
    return error;
  }
  throw new Error("expected the operation to fail");
}

function createStorageStub(beforeContent?: () => Promise<void>): StorageAdapter {
  return {
    initialize: async () => {},
    checkHealth: async () => {},
    putObject: async () => {},
    getObject: async () => {
      await beforeContent?.();
      return FILE_BYTES;
    },
    deleteObject: async () => {},
    headObject: async (key) => ({
      key,
      contentLength: FILE_BYTES.byteLength,
      contentType: "application/pdf",
      checksumSha256: undefined,
    }),
    createDownloadUrl: async (key) => {
      await beforeContent?.();
      return `https://storage.test/${key}`;
    },
    close: async () => {},
  };
}

type LockOutcome = "refused" | "granted";

type LockProbe = (documentIds: ReadonlyArray<string>) => Promise<void>;

// Takes FOR UPDATE NOWAIT on one document from a second connection. "refused" means another transaction
// holds a conflicting row lock on it; "granted" means no transaction does.
async function probeDocumentLock(client: DatabaseClient, documentId: string): Promise<LockOutcome> {
  try {
    await client.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM documents WHERE id = ${documentId} FOR UPDATE NOWAIT`);
    });
    return "granted";
  } catch (error: unknown) {
    if (!isLockNotAvailable(error)) throw error;
    return "refused";
  }
}

// Probes each document an audit write inserts, so the outcomes hold one entry per document.
function probeLocksInto(client: DatabaseClient, outcomes: Array<LockOutcome>): LockProbe {
  return async (documentIds) => {
    for (const documentId of documentIds) {
      outcomes.push(await probeDocumentLock(client, documentId));
    }
  };
}

// Delegates every call to the real repository. Each audit write runs the probe first, inside the unit of
// work, so the probe sees the locks the production code holds at the moment it inserts the audit rows.
class AuditLockProbeRepository implements IDownloadRepository {
  public constructor(
    private readonly inner: IDownloadRepository,
    private readonly probe: LockProbe,
  ) {}

  public async findDownloadTarget(documentId: string): Promise<DownloadTargetRecord | null> {
    return await this.inner.findDownloadTarget(documentId);
  }

  public async findDownloadTargets(
    documentIds: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<DownloadTargetRecord>> {
    return await this.inner.findDownloadTargets(documentIds);
  }

  public async checkCategoryPermissions(
    documentIds: ReadonlyArray<string>,
    options?: { lock?: "share" | "update" } | undefined,
  ): Promise<ReadonlyArray<DocumentCategoryPermissionStatus>> {
    return await this.inner.checkCategoryPermissions(documentIds, options);
  }

  public async recordDownloadAuditEvent(event: CreateDownloadAuditEventInput): Promise<void> {
    await this.recordDownloadAuditEvents([event]);
  }

  public async recordDownloadAuditEvents(
    events: ReadonlyArray<CreateDownloadAuditEventInput>,
  ): Promise<void> {
    await this.probe(events.flatMap((event) => (event.documentId ? [event.documentId] : [])));
    await this.inner.recordDownloadAuditEvents(events);
  }

  public async transaction<T>(callback: (txRepo: IDownloadRepository) => Promise<T>): Promise<T> {
    return await this.inner.transaction(
      async (txRepo) => await callback(new AuditLockProbeRepository(txRepo, this.probe)),
    );
  }
}

describe("Download audit write path PostgreSQL integration (BE-S3-04 / AC-09.01, AC-10.01)", () => {
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

  function requireDatabase(): DatabaseClient {
    if (database === undefined) {
      throw new Error("PostgreSQL integration database was not initialized");
    }
    return database;
  }

  async function seedFixture(client: DatabaseClient, downloadEnabled: boolean): Promise<Fixture> {
    const schema = await import("@axentra/db");
    const suffix = crypto.randomUUID();
    const fixture: Fixture = {
      userId: crypto.randomUUID(),
      userEmail: `audit-${suffix}@axentra.local`,
      categoryId: crypto.randomUUID(),
      documentIds: [crypto.randomUUID(), crypto.randomUUID()],
    };

    try {
      await client.db.insert(schema.users).values({
        id: fixture.userId,
        email: fixture.userEmail,
        name: "Audit Test User",
        passwordHash: "dummy-hash",
        role: "member_team",
      });
      await client.db.insert(schema.categories).values({
        id: fixture.categoryId,
        name: `Audit-${suffix}`,
        slug: `audit-${suffix}`,
      });
      await client.db.insert(schema.categoryDownloadPermissions).values({
        categoryId: fixture.categoryId,
        downloadEnabled,
      });
      await client.db.insert(schema.documents).values(
        fixture.documentIds.map((documentId, index): typeof documentsTable.$inferInsert => ({
          id: documentId,
          title: `Laporan-${suffix}-${index}.pdf`,
          categoryId: fixture.categoryId,
          processingStatus: "completed",
        })),
      );
      await client.db.insert(schema.documentFiles).values(
        fixture.documentIds.map((documentId, index) => ({
          id: crypto.randomUUID(),
          documentId,
          storageKey: `documents/${documentId}/laporan-${index}.pdf`,
          originalName: `laporan-${index}.pdf`,
          mimeType: "application/pdf",
          fileSize: FILE_BYTES.byteLength,
          fileExtension: "pdf",
        })),
      );
    } catch (error: unknown) {
      // Remove whatever was inserted before the failure, so no partial fixture stays in the database.
      await removeFixture(client, fixture);
      throw error;
    }

    return fixture;
  }

  async function removeFixture(client: DatabaseClient, fixture: Fixture): Promise<void> {
    const schema = await import("@axentra/db");
    const documentIds = [...fixture.documentIds];

    await client.db
      .delete(schema.downloadAuditEvents)
      .where(inArray(schema.downloadAuditEvents.documentId, documentIds));
    await client.db
      .delete(schema.documentFiles)
      .where(inArray(schema.documentFiles.documentId, documentIds));
    await client.db.delete(schema.documents).where(inArray(schema.documents.id, documentIds));
    await client.db
      .delete(schema.categoryDownloadPermissions)
      .where(eq(schema.categoryDownloadPermissions.categoryId, fixture.categoryId));
    await client.db.delete(schema.categories).where(eq(schema.categories.id, fixture.categoryId));
    await client.db.delete(schema.users).where(eq(schema.users.id, fixture.userId));
  }

  async function countAuditRows(
    client: DatabaseClient,
    documentIds: ReadonlyArray<string>,
  ): Promise<number> {
    const schema = await import("@axentra/db");
    const rows = await client.db
      .select()
      .from(schema.downloadAuditEvents)
      .where(inArray(schema.downloadAuditEvents.documentId, [...documentIds]));
    return rows.length;
  }

  async function loadModules() {
    const [repository, operations, bulkOperations, errors] = await Promise.all([
      import("../apps/api/src/modules/documents/download.repository"),
      import("../apps/api/src/modules/documents/download.operations"),
      import("../apps/api/src/modules/documents/bulk-download.operations"),
      import("../apps/api/src/http/errors"),
    ]);
    return {
      DrizzleDownloadRepository: repository.DrizzleDownloadRepository,
      executeDownloadOperation: operations.executeDownloadOperation,
      executeBulkDownloadOperation: bulkOperations.executeBulkDownloadOperation,
      AppError: errors.AppError,
      ForbiddenError: errors.ForbiddenError,
    };
  }

  integrationTest(
    "fails closed with a generic error and no audit row when the audit insert violates a constraint",
    async () => {
      const client = requireDatabase();
      const modules = await loadModules();
      const fixture = await seedFixture(client, true);
      const [documentId] = fixture.documentIds;

      try {
        // The user id is not in the users table, so the audit insert violates its foreign key.
        const unknownUser: AuthUser = {
          id: crypto.randomUUID(),
          email: `unknown-${crypto.randomUUID()}@axentra.local`,
          role: "member_team",
          name: "Unknown User",
        };
        const error = await captureError(
          modules.executeDownloadOperation(
            {
              downloadRepository: new modules.DrizzleDownloadRepository(client.db),
              storage: createStorageStub(),
            },
            { documentId, user: unknownUser },
          ),
        );

        if (!(error instanceof modules.AppError)) throw new Error("expected an AppError");
        expect(error.code).toBe("INTERNAL_ERROR");
        expect(error.status).toBe(500);
        expect(error).not.toHaveProperty("params");
        expect(await countAuditRows(client, [documentId])).toBe(0);
      } finally {
        await removeFixture(client, fixture);
      }
    },
  );

  integrationTest(
    "rolls back the audit row when the unit of work fails after recording",
    async () => {
      const client = requireDatabase();
      const modules = await loadModules();
      const fixture = await seedFixture(client, true);
      const [documentId] = fixture.documentIds;

      try {
        const repository = new modules.DrizzleDownloadRepository(client.db);

        // Database promises go through captureError, not expect(): under bun test, expect() wrapping a
        // postgres.js transaction never invokes the transaction callback, so the test hangs.
        const error = await captureError(
          repository.transaction(async (txRepo) => {
            await txRepo.recordDownloadAuditEvent({
              userId: fixture.userId,
              documentId,
              documentName: "laporan-0.pdf",
            });
            throw new Error("unit of work failed after recording");
          }),
        );
        if (!(error instanceof Error)) throw new Error("expected the unit of work to fail");
        expect(error.message).toBe("unit of work failed after recording");

        expect(await countAuditRows(client, [documentId])).toBe(0);
      } finally {
        await removeFixture(client, fixture);
      }
    },
  );

  integrationTest(
    "writes one audit row with who, which document, and when for a single download",
    async () => {
      const client = requireDatabase();
      const modules = await loadModules();
      const schema = await import("@axentra/db");
      const fixture = await seedFixture(client, true);
      const [documentId] = fixture.documentIds;

      try {
        const before = Date.now();
        const result = await modules.executeDownloadOperation(
          {
            downloadRepository: new modules.DrizzleDownloadRepository(client.db),
            storage: createStorageStub(),
          },
          { documentId, user: memberOf(fixture) },
        );

        expect(result.kind).toBe("url");
        const rows = await client.db
          .select()
          .from(schema.downloadAuditEvents)
          .where(eq(schema.downloadAuditEvents.documentId, documentId));
        expect(rows).toHaveLength(1);
        const row = rows[0];
        if (row === undefined) throw new Error("expected one persisted audit row");
        expect(row.userId).toBe(fixture.userId);
        expect(row.userName).toBe("Audit Test User");
        expect(row.userEmail).toBe(fixture.userEmail);
        expect(row.documentId).toBe(documentId);
        expect(row.documentName).toBe("laporan-0.pdf");
        expect(row.downloadedAt.getTime()).toBeGreaterThanOrEqual(before);
        expect(row.downloadedAt.getTime()).toBeLessThanOrEqual(Date.now());
      } finally {
        await removeFixture(client, fixture);
      }
    },
  );

  integrationTest(
    "denies and writes no audit row when category permission is revoked during storage I/O",
    async () => {
      const client = requireDatabase();
      const modules = await loadModules();
      const schema = await import("@axentra/db");
      const fixture = await seedFixture(client, true);
      const [documentId] = fixture.documentIds;

      try {
        const storage = createStorageStub(async () => {
          await client.db
            .update(schema.categoryDownloadPermissions)
            .set({ downloadEnabled: false })
            .where(eq(schema.categoryDownloadPermissions.categoryId, fixture.categoryId));
        });

        const error = await captureError(
          modules.executeDownloadOperation(
            { downloadRepository: new modules.DrizzleDownloadRepository(client.db), storage },
            { documentId, user: memberOf(fixture) },
          ),
        );

        expect(error).toBeInstanceOf(modules.ForbiddenError);
        expect(await countAuditRows(client, [documentId])).toBe(0);
      } finally {
        await removeFixture(client, fixture);
      }
    },
  );

  integrationTest(
    "blocks FOR UPDATE on a document while the single download audit unit of work holds its share lock",
    async () => {
      const client = requireDatabase();
      const modules = await loadModules();
      const fixture = await seedFixture(client, true);
      const [documentId] = fixture.documentIds;

      try {
        const lockOutcomes: Array<LockOutcome> = [];
        const repository = new AuditLockProbeRepository(
          new modules.DrizzleDownloadRepository(client.db),
          probeLocksInto(client, lockOutcomes),
        );

        const result = await modules.executeDownloadOperation(
          { downloadRepository: repository, storage: createStorageStub() },
          { documentId, user: memberOf(fixture) },
        );

        expect(result.kind).toBe("url");
        expect(lockOutcomes).toEqual(["refused"]);
        expect(await countAuditRows(client, [documentId])).toBe(1);
      } finally {
        await removeFixture(client, fixture);
      }
    },
  );

  integrationTest(
    "fails closed with a generic error and no audit rows when the bulk audit insert violates a constraint",
    async () => {
      const client = requireDatabase();
      const modules = await loadModules();
      const fixture = await seedFixture(client, true);

      try {
        const unknownUser: AuthUser = {
          id: crypto.randomUUID(),
          email: `unknown-${crypto.randomUUID()}@axentra.local`,
          role: "member_team",
          name: "Unknown User",
        };
        const error = await captureError(
          modules.executeBulkDownloadOperation(
            {
              downloadRepository: new modules.DrizzleDownloadRepository(client.db),
              storage: createStorageStub(),
            },
            { documentIds: [...fixture.documentIds], user: unknownUser },
          ),
        );

        if (!(error instanceof modules.AppError)) throw new Error("expected an AppError");
        expect(error.code).toBe("INTERNAL_ERROR");
        expect(error.status).toBe(500);
        expect(error).not.toHaveProperty("params");
        expect(await countAuditRows(client, fixture.documentIds)).toBe(0);
      } finally {
        await removeFixture(client, fixture);
      }
    },
  );

  integrationTest(
    "writes one audit row per document with who, which document, and when for a bulk download",
    async () => {
      const client = requireDatabase();
      const modules = await loadModules();
      const schema = await import("@axentra/db");
      const fixture = await seedFixture(client, true);
      // The seeded file names follow each document's position in the fixture.
      const expectedNames = new Map<string | null, string>(
        fixture.documentIds.map((documentId, index): [string, string] => [
          documentId,
          `laporan-${index}.pdf`,
        ]),
      );

      try {
        const before = Date.now();
        const result = await modules.executeBulkDownloadOperation(
          {
            downloadRepository: new modules.DrizzleDownloadRepository(client.db),
            storage: createStorageStub(),
          },
          { documentIds: [...fixture.documentIds], user: memberOf(fixture) },
        );
        const after = Date.now();

        expect(result.fileCount).toBe(2);
        const rows = await client.db
          .select()
          .from(schema.downloadAuditEvents)
          .where(inArray(schema.downloadAuditEvents.documentId, [...fixture.documentIds]));
        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.documentId).sort()).toEqual([...fixture.documentIds].sort());
        for (const row of rows) {
          expect(row.userId).toBe(fixture.userId);
          expect(row.userName).toBe("Audit Test User");
          expect(row.userEmail).toBe(fixture.userEmail);
          const expectedName = expectedNames.get(row.documentId);
          if (expectedName === undefined) throw new Error("expected a row for a seeded document");
          expect(row.documentName).toBe(expectedName);
          expect(row.downloadedAt.getTime()).toBeGreaterThanOrEqual(before);
          expect(row.downloadedAt.getTime()).toBeLessThanOrEqual(after);
        }
      } finally {
        await removeFixture(client, fixture);
      }
    },
  );

  integrationTest(
    "denies and writes no audit rows when category permission is revoked during bulk storage I/O",
    async () => {
      const client = requireDatabase();
      const modules = await loadModules();
      const schema = await import("@axentra/db");
      const fixture = await seedFixture(client, true);

      try {
        const storage = createStorageStub(async () => {
          await client.db
            .update(schema.categoryDownloadPermissions)
            .set({ downloadEnabled: false })
            .where(eq(schema.categoryDownloadPermissions.categoryId, fixture.categoryId));
        });

        const error = await captureError(
          modules.executeBulkDownloadOperation(
            { downloadRepository: new modules.DrizzleDownloadRepository(client.db), storage },
            { documentIds: [...fixture.documentIds], user: memberOf(fixture) },
          ),
        );

        expect(error).toBeInstanceOf(modules.ForbiddenError);
        expect(await countAuditRows(client, fixture.documentIds)).toBe(0);
      } finally {
        await removeFixture(client, fixture);
      }
    },
  );

  integrationTest(
    "blocks FOR UPDATE on every selected document while the bulk audit unit of work holds its share locks",
    async () => {
      const client = requireDatabase();
      const modules = await loadModules();
      const fixture = await seedFixture(client, true);

      try {
        const lockOutcomes: Array<LockOutcome> = [];
        const repository = new AuditLockProbeRepository(
          new modules.DrizzleDownloadRepository(client.db),
          probeLocksInto(client, lockOutcomes),
        );

        const result = await modules.executeBulkDownloadOperation(
          { downloadRepository: repository, storage: createStorageStub() },
          { documentIds: [...fixture.documentIds], user: memberOf(fixture) },
        );

        expect(result.fileCount).toBe(2);
        expect(lockOutcomes).toEqual(["refused", "refused"]);
        expect(await countAuditRows(client, fixture.documentIds)).toBe(2);
      } finally {
        await removeFixture(client, fixture);
      }
    },
  );
});
