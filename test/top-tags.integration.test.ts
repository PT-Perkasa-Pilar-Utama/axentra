import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import type {
  DatabaseClient,
  closeDatabase as CloseDatabase,
  createDatabaseClient as CreateDatabaseClient,
} from "@axentra/db";
import type { TopTagsQuery } from "@axentra/shared";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? test : test.skip;

describe("Top Tags PostgreSQL integration", () => {
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

  integrationTest(
    "ranks persisted tags and applies context and document eligibility in PostgreSQL",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        { documents, documentSmartTags, smartTags },
        { DrizzleTopTagsRepository },
        { createTopTagsService },
      ] = await Promise.all([
        import("@axentra/db"),
        import("../apps/api/src/modules/tags/tags.repository"),
        import("../apps/api/src/modules/tags/tags.service"),
      ]);
      const suffix = crypto.randomUUID();
      const ids = {
        popularDocumentOne: crypto.randomUUID(),
        popularDocumentTwo: crypto.randomUUID(),
        recentDocument: crypto.randomUUID(),
        queuedDocument: crypto.randomUUID(),
        deletedDocument: crypto.randomUUID(),
        popularTag: crypto.randomUUID(),
        recentTag: crypto.randomUUID(),
        searchOnlyTag: crypto.randomUUID(),
        queuedOnlyTag: crypto.randomUUID(),
        deletedOnlyTag: crypto.randomUUID(),
      };
      const names = {
        popular: `integration-${suffix}-popular`,
        recent: `integration-${suffix}-recent`,
        searchOnly: `integration-${suffix}-search-only`,
        queuedOnly: `integration-${suffix}-queued-only`,
        deletedOnly: `integration-${suffix}-deleted-only`,
      };
      const documentIds = [
        ids.popularDocumentOne,
        ids.popularDocumentTwo,
        ids.recentDocument,
        ids.queuedDocument,
        ids.deletedDocument,
      ];
      const tagIds = [
        ids.popularTag,
        ids.recentTag,
        ids.searchOnlyTag,
        ids.queuedOnlyTag,
        ids.deletedOnlyTag,
      ];

      try {
        await database.db.insert(documents).values([
          {
            id: ids.popularDocumentOne,
            title: `Top Tags ${suffix} One`,
            processingStatus: "completed",
          },
          {
            id: ids.popularDocumentTwo,
            title: `Top Tags ${suffix} Two`,
            processingStatus: "completed",
          },
          {
            id: ids.recentDocument,
            title: `Top Tags ${suffix} Recent`,
            processingStatus: "completed",
          },
          {
            id: ids.queuedDocument,
            title: `Top Tags ${suffix} Queued`,
            processingStatus: "queued",
          },
          {
            id: ids.deletedDocument,
            title: `Top Tags ${suffix} Deleted`,
            processingStatus: "completed",
            deletedAt: new Date("2026-01-05T00:00:00.000Z"),
          },
        ]);
        await database.db.insert(smartTags).values([
          { id: ids.popularTag, name: names.popular },
          { id: ids.recentTag, name: names.recent },
          { id: ids.searchOnlyTag, name: names.searchOnly },
          { id: ids.queuedOnlyTag, name: names.queuedOnly },
          { id: ids.deletedOnlyTag, name: names.deletedOnly },
        ]);
        await database.db.insert(documentSmartTags).values([
          {
            documentId: ids.popularDocumentOne,
            tagId: ids.popularTag,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          },
          {
            documentId: ids.popularDocumentTwo,
            tagId: ids.popularTag,
            createdAt: new Date("2026-01-02T00:00:00.000Z"),
          },
          {
            documentId: ids.popularDocumentTwo,
            tagId: ids.searchOnlyTag,
            createdAt: new Date("2026-01-02T00:00:00.000Z"),
          },
          {
            documentId: ids.recentDocument,
            tagId: ids.recentTag,
            createdAt: new Date("2026-01-03T00:00:00.000Z"),
          },
          {
            documentId: ids.queuedDocument,
            tagId: ids.queuedOnlyTag,
            createdAt: new Date("2026-01-04T00:00:00.000Z"),
          },
          {
            documentId: ids.deletedDocument,
            tagId: ids.deletedOnlyTag,
            createdAt: new Date("2026-01-05T00:00:00.000Z"),
          },
        ]);

        const repository = new DrizzleTopTagsRepository(database.db);
        const dashboardQuery: TopTagsQuery = { context: "dashboard", limit: 20 };
        const dashboardTags = await repository.listTopTags(dashboardQuery);
        const dashboardCounts = new Map(dashboardTags.map((tag) => [tag.name, tag.documentCount]));

        expect(dashboardCounts.get(names.popular)).toBe(2);
        expect(dashboardCounts.get(names.recent)).toBe(1);
        expect(dashboardCounts.has(names.queuedOnly)).toBe(false);
        expect(dashboardCounts.has(names.deletedOnly)).toBe(false);

        const searchQuery: TopTagsQuery = {
          context: "search",
          limit: 20,
          documentIds: [ids.popularDocumentOne, ids.popularDocumentTwo],
        };
        const searchTags = await repository.listTopTags(searchQuery);
        const searchCounts = new Map(searchTags.map((tag) => [tag.name, tag.documentCount]));

        expect(searchCounts.get(names.popular)).toBe(2);
        expect(searchCounts.get(names.searchOnly)).toBe(1);
        expect(searchCounts.has(names.recent)).toBe(false);
        expect(searchCounts.has(names.queuedOnly)).toBe(false);
        expect(searchCounts.has(names.deletedOnly)).toBe(false);

        const dashboardRecentTags = await repository.listMostRecentDocumentTags(dashboardQuery);
        expect(dashboardRecentTags.map((tag) => tag.id)).toEqual([ids.recentTag]);

        const searchRecentTags = await repository.listMostRecentDocumentTags(searchQuery);
        expect(new Set(searchRecentTags.map((tag) => tag.id))).toEqual(
          new Set([ids.popularTag, ids.searchOnlyTag]),
        );

        const dashboardTopTags = await createTopTagsService(repository).listTopTags({
          context: "dashboard",
          limit: 3,
        });
        expect(dashboardTopTags[0]?.id).toBe(ids.recentTag);

        const freshSearchQuery: TopTagsQuery = {
          context: "search",
          limit: 3,
          documentIds: [ids.recentDocument],
        };
        const freshTags = await repository.listTopTags(freshSearchQuery);
        expect(freshTags.map((tag) => tag.id)).toEqual([ids.recentTag]);
      } finally {
        await database.db.delete(documents).where(inArray(documents.id, documentIds));
        await database.db.delete(smartTags).where(inArray(smartTags.id, tagIds));
      }
    },
  );
});
