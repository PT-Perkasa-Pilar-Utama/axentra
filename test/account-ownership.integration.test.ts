import crypto from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
import type * as DbModule from "@axentra/db";
import {
  assertClientConnectedToDisposableDatabase,
  assertDisposableTestDatabase,
} from "./helpers/disposable-database";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? test : test.skip;

let dbModule: typeof DbModule | undefined;
let database: DbModule.DatabaseClient | undefined;
const createdUserIds: string[] = [];
const createdDocumentIds: string[] = [];

function readyDatabase(): { client: DbModule.DatabaseClient; schema: typeof DbModule } {
  if (dbModule === undefined || database === undefined) {
    throw new Error("PostgreSQL integration database was not initialized");
  }
  return { client: database, schema: dbModule };
}

function firstOrThrow<T>(rows: readonly T[], label: string): T {
  const [first] = rows;
  if (first === undefined) throw new Error(`${label} returned no rows`);
  return first;
}

// Collects the message chain so the PostgreSQL constraint name is visible through Drizzle's wrapper.
function describeError(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join(" | ");
}

async function captureError(operation: PromiseLike<unknown>): Promise<unknown> {
  try {
    await operation;
    return undefined;
  } catch (error: unknown) {
    return error;
  }
}

describe("Account status and document ownership PostgreSQL constraints (DB-S4-01)", () => {
  beforeAll(async () => {
    if (!runIntegrationTests) return;

    const [{ loadApiConfigFromRuntime }, db] = await Promise.all([
      import("@axentra/config"),
      import("@axentra/db"),
    ]);
    const config = loadApiConfigFromRuntime();
    assertDisposableTestDatabase(config.DATABASE_URL);
    dbModule = db;
    database = db.createDatabaseClient(config.DATABASE_URL);
    assertClientConnectedToDisposableDatabase(database, config.DATABASE_URL);
    await db.checkDatabase(database);
  });

  afterAll(async () => {
    if (database === undefined || dbModule === undefined) return;
    const { client, schema } = readyDatabase();
    if (createdDocumentIds.length > 0) {
      await client.db
        .delete(schema.documents)
        .where(inArray(schema.documents.id, createdDocumentIds));
    }
    if (createdUserIds.length > 0) {
      await client.db.delete(schema.users).where(inArray(schema.users.id, createdUserIds));
    }
    await dbModule.closeDatabase(database);
  });

  integrationTest("defaults a new account to active", async () => {
    const { client, schema } = readyDatabase();

    const inserted = firstOrThrow(
      await client.db
        .insert(schema.users)
        .values({
          email: `status-default-${crypto.randomUUID()}@axentra.invalid`,
          passwordHash: "not-a-real-hash",
          role: "member_team",
        })
        .returning({ id: schema.users.id, status: schema.users.status }),
      "insert user",
    );
    createdUserIds.push(inserted.id);

    expect(inserted.status).toBe("active");
  });

  integrationTest("rejects an account status outside active and inactive", async () => {
    const { client, schema } = readyDatabase();
    const email = `status-check-${crypto.randomUUID()}@axentra.invalid`;

    // Raw SQL bypasses the TypeScript literal union, so the database CHECK is what rejects the value.
    const error = await captureError(
      client.db.execute(
        sql`insert into users (id, email, password_hash, role, status)
            values (${crypto.randomUUID()}, ${email}, 'not-a-real-hash', 'member_team', 'suspended')`,
      ),
    );

    expect(error).toBeDefined();
    expect(describeError(error)).toContain("users_status_check");
    const persisted = await client.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email));
    expect(persisted).toHaveLength(0);
  });

  integrationTest("rejects a document uploader that does not reference a user", async () => {
    const { client, schema } = readyDatabase();

    const error = await captureError(
      client.db.insert(schema.documents).values({
        title: `orphan-uploader-${crypto.randomUUID()}`,
        uploadedBy: crypto.randomUUID(),
      }),
    );

    expect(error).toBeDefined();
    expect(describeError(error)).toContain("documents_uploaded_by_users_id_fk");
  });

  integrationTest(
    "clears uploaded_by and keeps the document when its uploader is deleted",
    async () => {
      const { client, schema } = readyDatabase();

      const uploader = firstOrThrow(
        await client.db
          .insert(schema.users)
          .values({
            email: `uploader-${crypto.randomUUID()}@axentra.invalid`,
            passwordHash: "not-a-real-hash",
            role: "member_team",
          })
          .returning({ id: schema.users.id }),
        "insert uploader",
      );
      const document = firstOrThrow(
        await client.db
          .insert(schema.documents)
          .values({
            title: `owned-document-${crypto.randomUUID()}`,
            uploadedBy: uploader.id,
          })
          .returning({ id: schema.documents.id }),
        "insert document",
      );
      createdDocumentIds.push(document.id);

      await client.db.delete(schema.users).where(eq(schema.users.id, uploader.id));

      const remaining = firstOrThrow(
        await client.db
          .select({ id: schema.documents.id, uploadedBy: schema.documents.uploadedBy })
          .from(schema.documents)
          .where(eq(schema.documents.id, document.id)),
        "select document",
      );
      expect(remaining.id).toBe(document.id);
      expect(remaining.uploadedBy).toBeNull();
    },
  );

  integrationTest("keeps archived_at null until an archive timestamp is set", async () => {
    const { client, schema } = readyDatabase();

    const document = firstOrThrow(
      await client.db
        .insert(schema.documents)
        .values({ title: `archive-check-${crypto.randomUUID()}` })
        .returning({ id: schema.documents.id, archivedAt: schema.documents.archivedAt }),
      "insert document",
    );
    createdDocumentIds.push(document.id);
    expect(document.archivedAt).toBeNull();

    const archivedAt = new Date("2026-11-05T00:00:00.000Z");
    await client.db
      .update(schema.documents)
      .set({ archivedAt })
      .where(eq(schema.documents.id, document.id));

    const archived = firstOrThrow(
      await client.db
        .select({ archivedAt: schema.documents.archivedAt })
        .from(schema.documents)
        .where(eq(schema.documents.id, document.id)),
      "select archived document",
    );
    expect(archived.archivedAt).toEqual(archivedAt);
  });
});
