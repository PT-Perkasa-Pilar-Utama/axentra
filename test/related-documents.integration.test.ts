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

describe("Related Documents PostgreSQL integration", () => {
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

  integrationTest("returns unique active documents with only their shared tags", async () => {
    if (database === undefined) {
      throw new Error("PostgreSQL integration database was not initialized");
    }

    const [{ documentFiles, documentSmartTags, documents, smartTags }, { DocumentRepository }] =
      await Promise.all([
        import("@axentra/db"),
        import("../apps/api/src/modules/documents/documents.repository"),
      ]);
    const suffix = crypto.randomUUID();
    const ids = {
      source: crypto.randomUUID(),
      emptySource: crypto.randomUUID(),
      newestRelated: crypto.randomUUID(),
      olderRelated: crypto.randomUUID(),
      noMatch: crypto.randomUUID(),
      deletedRelated: crypto.randomUUID(),
      missingFileRelated: crypto.randomUUID(),
      tagAlpha: crypto.randomUUID(),
      tagBeta: crypto.randomUUID(),
      tagUnrelated: crypto.randomUUID(),
    };
    const documentIds = [
      ids.source,
      ids.emptySource,
      ids.newestRelated,
      ids.olderRelated,
      ids.noMatch,
      ids.deletedRelated,
      ids.missingFileRelated,
    ];
    const tagIds = [ids.tagAlpha, ids.tagBeta, ids.tagUnrelated];
    const olderCreatedAt = new Date("2026-01-01T00:00:00.000Z");
    const newestCreatedAt = new Date("2026-01-02T00:00:00.000Z");

    try {
      await database.db.insert(documents).values([
        { id: ids.source, title: `Related source ${suffix}`, processingStatus: "completed" },
        { id: ids.emptySource, title: `Empty source ${suffix}`, processingStatus: "completed" },
        {
          id: ids.newestRelated,
          title: `Newest related ${suffix}`,
          processingStatus: "completed",
          createdAt: newestCreatedAt,
        },
        {
          id: ids.olderRelated,
          title: `Older related ${suffix}`,
          processingStatus: "completed",
          createdAt: olderCreatedAt,
        },
        { id: ids.noMatch, title: `No match ${suffix}`, processingStatus: "completed" },
        {
          id: ids.deletedRelated,
          title: `Deleted related ${suffix}`,
          processingStatus: "completed",
          deletedAt: new Date("2026-01-03T00:00:00.000Z"),
        },
        {
          id: ids.missingFileRelated,
          title: `Missing file related ${suffix}`,
          processingStatus: "completed",
        },
      ]);
      await database.db.insert(documentFiles).values([
        {
          id: crypto.randomUUID(),
          documentId: ids.source,
          storageKey: `integration/${suffix}/source.pdf`,
          originalName: "source.pdf",
          mimeType: "application/pdf",
          fileSize: 100,
          fileExtension: "pdf",
        },
        {
          id: crypto.randomUUID(),
          documentId: ids.newestRelated,
          storageKey: `integration/${suffix}/newest.pdf`,
          originalName: "newest.pdf",
          mimeType: "application/pdf",
          fileSize: 100,
          fileExtension: "pdf",
        },
        {
          id: crypto.randomUUID(),
          documentId: ids.olderRelated,
          storageKey: `integration/${suffix}/older.pdf`,
          originalName: "older.pdf",
          mimeType: "application/pdf",
          fileSize: 100,
          fileExtension: "pdf",
        },
        {
          id: crypto.randomUUID(),
          documentId: ids.noMatch,
          storageKey: `integration/${suffix}/no-match.pdf`,
          originalName: "no-match.pdf",
          mimeType: "application/pdf",
          fileSize: 100,
          fileExtension: "pdf",
        },
        {
          id: crypto.randomUUID(),
          documentId: ids.deletedRelated,
          storageKey: `integration/${suffix}/deleted.pdf`,
          originalName: "deleted.pdf",
          mimeType: "application/pdf",
          fileSize: 100,
          fileExtension: "pdf",
        },
      ]);
      await database.db.insert(smartTags).values([
        { id: ids.tagAlpha, name: `integration-${suffix}-alpha` },
        { id: ids.tagBeta, name: `integration-${suffix}-beta` },
        { id: ids.tagUnrelated, name: `integration-${suffix}-unrelated` },
      ]);
      await database.db.insert(documentSmartTags).values([
        { documentId: ids.source, tagId: ids.tagAlpha },
        { documentId: ids.source, tagId: ids.tagBeta },
        { documentId: ids.newestRelated, tagId: ids.tagAlpha },
        { documentId: ids.newestRelated, tagId: ids.tagBeta },
        { documentId: ids.newestRelated, tagId: ids.tagUnrelated },
        { documentId: ids.olderRelated, tagId: ids.tagAlpha },
        { documentId: ids.noMatch, tagId: ids.tagUnrelated },
        { documentId: ids.deletedRelated, tagId: ids.tagAlpha },
        { documentId: ids.missingFileRelated, tagId: ids.tagBeta },
      ]);

      const repository = new DocumentRepository(database.db);
      const limitedResults = await repository.listRelatedDocuments(ids.source, 1);
      expect(limitedResults.map((document) => document.id)).toEqual([ids.newestRelated]);

      const relatedDocuments = await repository.listRelatedDocuments(ids.source, 20);
      expect(relatedDocuments.map((document) => document.id)).toEqual([
        ids.newestRelated,
        ids.olderRelated,
      ]);
      expect(relatedDocuments[0]?.sharedTags).toEqual([
        `integration-${suffix}-alpha`,
        `integration-${suffix}-beta`,
      ]);
      expect(relatedDocuments[1]?.sharedTags).toEqual([`integration-${suffix}-alpha`]);
      expect(await repository.listRelatedDocuments(ids.emptySource, 20)).toEqual([]);
    } finally {
      await database.db.delete(documents).where(inArray(documents.id, documentIds));
      await database.db.delete(smartTags).where(inArray(smartTags.id, tagIds));
    }
  });
});
