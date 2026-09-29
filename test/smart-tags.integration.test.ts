import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import type {
  DatabaseClient,
  closeDatabase as CloseDatabase,
  createDatabaseClient as CreateDatabaseClient,
} from "@axentra/db";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? test : test.skip;

describe("Smart Tags PostgreSQL integration (Task BE-S2-01 / AC-04.02)", () => {
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

  integrationTest("persists and exposes document Smart Tags in PostgreSQL atomically", async () => {
    if (database === undefined) {
      throw new Error("PostgreSQL integration database was not initialized");
    }

    const [
      { documents, smartTags },
      { DrizzleDocumentSmartTagsRepository },
      { DrizzleDocumentProcessingRepository },
    ] = await Promise.all([
      import("@axentra/db"),
      import("../apps/api/src/modules/documents/smart-tags.repository"),
      import("../apps/worker/src/processors/document.processor.repository"),
    ]);

    const suffix = crypto.randomUUID().slice(0, 8);
    const docId = crypto.randomUUID();
    const tagOne = `finance-${suffix}`;
    const tagTwo = `strategy-${suffix}`;
    const tagThree = `legal-${suffix}`;

    try {
      // 1. Insert initial document in queued state
      await database.db.insert(documents).values({
        id: docId,
        title: `Smart Tags Doc ${suffix}`,
        processingStatus: "queued",
      });

      // 2. Process and complete with metadata and tags via worker repository
      const workerRepo = new DrizzleDocumentProcessingRepository(database.db);
      await workerRepo.completeWithMetadata(
        docId,
        {
          author: "Integration Author",
          rawMetadata: { test: true },
          extractedAt: new Date(),
        },
        [tagOne, tagTwo, tagThree, `extra-${suffix}`], // 4 tags provided; should cap at 3
      );

      // 3. Query via API DrizzleDocumentSmartTagsRepository
      const apiRepo = new DrizzleDocumentSmartTagsRepository(database.db);
      const tags = await apiRepo.findSmartTagsByDocumentId(docId);

      expect(tags.length).toBe(3);
      const tagNames = tags.map((t) => t.name);
      expect(tagNames).toContain(tagOne);
      expect(tagNames).toContain(tagTwo);
      expect(tagNames).toContain(tagThree);

      // 4. Verify document status transitioned to completed
      const docRecord = await apiRepo.findDocumentById(docId);
      expect(docRecord?.processingStatus).toBe("completed");
    } finally {
      await database.db.delete(documents).where(inArray(documents.id, [docId]));
      await database.db
        .delete(smartTags)
        .where(inArray(smartTags.name, [tagOne, tagTwo, tagThree, `extra-${suffix}`]));
    }
  });
});
