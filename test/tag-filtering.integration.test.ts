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

describe("Tag Filtering PostgreSQL integration (BE-S2-03 / AC-04.03, AC-04.04)", () => {
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
    "supports single-tag (AC-04.03) and multi-tag AND filtering (AC-04.04) on list and search in PostgreSQL",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        { documents, documentFiles, documentSmartTags, smartTags },
        { DocumentRepository },
        { DrizzleSearchRepository },
      ] = await Promise.all([
        import("@axentra/db"),
        import("../apps/api/src/modules/documents/documents.repository"),
        import("../apps/api/src/modules/search/search.repository"),
      ]);

      const suffix = crypto.randomUUID().slice(0, 8);
      const tagStrategyName = `strategy-${suffix}`;
      const tagLegalName = `legal-${suffix}`;
      const tagFinanceName = `finance-${suffix}`;

      const ids = {
        docStrategyOnly: crypto.randomUUID(),
        docStrategyAndLegal: crypto.randomUUID(),
        docLegalOnly: crypto.randomUUID(),
        docDeleted: crypto.randomUUID(),
        tagStrategy: crypto.randomUUID(),
        tagLegal: crypto.randomUUID(),
        tagFinance: crypto.randomUUID(),
      };

      const allDocIds = [
        ids.docStrategyOnly,
        ids.docStrategyAndLegal,
        ids.docLegalOnly,
        ids.docDeleted,
      ];
      const allTagIds = [ids.tagStrategy, ids.tagLegal, ids.tagFinance];

      try {
        // Insert tags
        await database.db.insert(smartTags).values([
          { id: ids.tagStrategy, name: tagStrategyName },
          { id: ids.tagLegal, name: tagLegalName },
          { id: ids.tagFinance, name: tagFinanceName },
        ]);

        // Insert documents
        const now = new Date();
        await database.db.insert(documents).values([
          {
            id: ids.docStrategyOnly,
            title: `Strategy Doc ${suffix}`,
            processingStatus: "completed",
            createdAt: new Date(now.getTime() - 3000),
          },
          {
            id: ids.docStrategyAndLegal,
            title: `Strategy and Legal Doc ${suffix}`,
            processingStatus: "completed",
            createdAt: new Date(now.getTime() - 2000),
          },
          {
            id: ids.docLegalOnly,
            title: `Legal Doc ${suffix}`,
            processingStatus: "completed",
            createdAt: new Date(now.getTime() - 1000),
          },
          {
            id: ids.docDeleted,
            title: `Deleted Doc ${suffix}`,
            processingStatus: "completed",
            createdAt: now,
            deletedAt: now,
          },
        ]);

        // Insert document files (required for active list/search)
        await database.db.insert(documentFiles).values([
          {
            id: crypto.randomUUID(),
            documentId: ids.docStrategyOnly,
            storageKey: `files/${ids.docStrategyOnly}.pdf`,
            originalName: `strategy-${suffix}.pdf`,
            mimeType: "application/pdf",
            fileSize: 1024,
            fileExtension: ".pdf",
          },
          {
            id: crypto.randomUUID(),
            documentId: ids.docStrategyAndLegal,
            storageKey: `files/${ids.docStrategyAndLegal}.pdf`,
            originalName: `strategy-legal-${suffix}.pdf`,
            mimeType: "application/pdf",
            fileSize: 2048,
            fileExtension: ".pdf",
          },
          {
            id: crypto.randomUUID(),
            documentId: ids.docLegalOnly,
            storageKey: `files/${ids.docLegalOnly}.pdf`,
            originalName: `legal-${suffix}.pdf`,
            mimeType: "application/pdf",
            fileSize: 4096,
            fileExtension: ".pdf",
          },
          {
            id: crypto.randomUUID(),
            documentId: ids.docDeleted,
            storageKey: `files/${ids.docDeleted}.pdf`,
            originalName: `deleted-${suffix}.pdf`,
            mimeType: "application/pdf",
            fileSize: 512,
            fileExtension: ".pdf",
          },
        ]);

        // Link document tags
        await database.db.insert(documentSmartTags).values([
          { id: crypto.randomUUID(), documentId: ids.docStrategyOnly, tagId: ids.tagStrategy },
          { id: crypto.randomUUID(), documentId: ids.docStrategyAndLegal, tagId: ids.tagStrategy },
          { id: crypto.randomUUID(), documentId: ids.docStrategyAndLegal, tagId: ids.tagLegal },
          { id: crypto.randomUUID(), documentId: ids.docLegalOnly, tagId: ids.tagLegal },
          { id: crypto.randomUUID(), documentId: ids.docDeleted, tagId: ids.tagStrategy },
          { id: crypto.randomUUID(), documentId: ids.docDeleted, tagId: ids.tagLegal },
        ]);

        const documentRepo = new DocumentRepository(database.db);
        const searchRepo = new DrizzleSearchRepository(database.db);

        // 1. AC-04.03 Single-tag filter on DocumentRepository
        const singleTagList = await documentRepo.listRecentDocuments(1, 20, [tagStrategyName]);
        const singleListIds = singleTagList.items.map((i) => i.id);
        expect(singleListIds).toContain(ids.docStrategyOnly);
        expect(singleListIds).toContain(ids.docStrategyAndLegal);
        expect(singleListIds).not.toContain(ids.docLegalOnly);
        expect(singleListIds).not.toContain(ids.docDeleted); // deleted doc omitted

        // 2. AC-04.03 Single-tag filter on SearchRepository
        const singleTagSearch = await searchRepo.searchDocuments({
          page: 1,
          limit: 20,
          tags: [tagStrategyName],
        });
        const singleSearchIds = singleTagSearch.items.map((i) => i.id);
        expect(singleSearchIds).toContain(ids.docStrategyOnly);
        expect(singleSearchIds).toContain(ids.docStrategyAndLegal);
        expect(singleSearchIds).not.toContain(ids.docLegalOnly);

        // 3. AC-04.04 Multi-tag filter (AND logic) on DocumentRepository
        const multiTagList = await documentRepo.listRecentDocuments(1, 20, [
          tagStrategyName,
          tagLegalName,
        ]);
        const multiListIds = multiTagList.items.map((i) => i.id);
        expect(multiListIds).toContain(ids.docStrategyAndLegal);
        expect(multiListIds).not.toContain(ids.docStrategyOnly); // misses legal
        expect(multiListIds).not.toContain(ids.docLegalOnly); // misses strategy
        expect(multiListIds).not.toContain(ids.docDeleted); // deleted doc omitted

        // 4. AC-04.04 Multi-tag filter (AND logic) on SearchRepository
        const multiTagSearch = await searchRepo.searchDocuments({
          page: 1,
          limit: 20,
          tags: [tagStrategyName, tagLegalName],
        });
        const multiSearchIds = multiTagSearch.items.map((i) => i.id);
        expect(multiSearchIds).toEqual([ids.docStrategyAndLegal]);

        // 5. Case-insensitivity check (e.g. UPPERCASE vs lowercase)
        const upperCaseList = await documentRepo.listRecentDocuments(1, 20, [
          tagStrategyName.toUpperCase(),
        ]);
        expect(upperCaseList.items.map((i) => i.id)).toContain(ids.docStrategyOnly);

        // 6. Non-existent tag returns empty results
        const emptyList = await documentRepo.listRecentDocuments(1, 20, [`non-existent-${suffix}`]);
        expect(emptyList.items.length).toBe(0);
        expect(emptyList.meta.total).toBe(0);
      } finally {
        // Cleanup test data
        await database.db.delete(documents).where(inArray(documents.id, allDocIds));
        await database.db.delete(smartTags).where(inArray(smartTags.id, allTagIds));
      }
    },
  );
});
