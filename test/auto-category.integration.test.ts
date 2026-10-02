import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import type {
  DatabaseClient,
  closeDatabase as CloseDatabase,
  createDatabaseClient as CreateDatabaseClient,
} from "@axentra/db";
import type { StorageAdapter } from "@axentra/storage";
import type {
  ApiSuccessEnvelope,
  CategorySummary,
  DocumentCategoryResponse,
} from "@axentra/shared";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? test : test.skip;

function createMockStorage(filesMap: Map<string, Uint8Array>): StorageAdapter {
  return {
    initialize: async () => undefined,
    checkHealth: async () => undefined,
    putObject: async () => undefined,
    getObject: async (key: string) => {
      const found = filesMap.get(key);
      if (!found) throw new Error("Object not found in mock storage");
      return found;
    },
    deleteObject: async () => undefined,
    headObject: async () => ({
      key: "dummy",
      contentLength: 100,
      contentType: "application/pdf",
      checksumSha256: undefined,
    }),
    createDownloadUrl: async () => "https://example.com/download",
    close: async () => undefined,
  };
}

describe("Auto-Category Assignment PostgreSQL Integration (Task BE-S2-04 / AC-05.01 & AC-05.02)", () => {
  let database: DatabaseClient | undefined;
  let closeDatabase: CloseDatabase;
  let createDatabaseClient: CreateDatabaseClient;
  const createdDocumentIds: string[] = [];
  const createdCategoryIds: string[] = [];
  let preExistingCategoryIds = new Set<string>();
  let databaseUrl = "";

  beforeAll(async () => {
    if (!runIntegrationTests) return;

    const [{ loadApiConfigFromRuntime }, db, { assertDisposableTestDatabase }] = await Promise.all([
      import("@axentra/config"),
      import("@axentra/db"),
      import("./helpers/disposable-database"),
    ]);
    closeDatabase = db.closeDatabase;
    createDatabaseClient = db.createDatabaseClient;
    const config = loadApiConfigFromRuntime();
    databaseUrl = config.DATABASE_URL;

    // Explicit disposable test database validation (F1)
    assertDisposableTestDatabase(config.DATABASE_URL);

    database = createDatabaseClient(config.DATABASE_URL);
    await db.checkDatabase(database);

    // Snapshot pre-existing categories for exclusion guard (F1)
    const preExisting = await database.db.select({ id: db.categories.id }).from(db.categories);
    preExistingCategoryIds = new Set(preExisting.map((c) => c.id));
  });

  afterAll(async () => {
    if (database !== undefined) {
      const { documents, documentFiles } = await import("@axentra/db");
      const { safeCleanupTestCategories } = await import("./helpers/disposable-database");

      // 1. Clean up only documents created by this test suite
      if (createdDocumentIds.length > 0) {
        await database.db
          .delete(documentFiles)
          .where(inArray(documentFiles.documentId, createdDocumentIds));
        await database.db.delete(documents).where(inArray(documents.id, createdDocumentIds));
      }

      // 2. Multi-layer safe category cleanup (F1)
      await safeCleanupTestCategories(database, createdCategoryIds, {
        preExistingCategoryIds,
        databaseUrl,
      });

      await closeDatabase(database);
    }
  });

  integrationTest(
    "AC-05.01: assigns Reporting category from content, auto-creates category with inactive download permission, and serves via API",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        { documents, documentFiles, categories, categoryDownloadPermissions },
        { DrizzleDocumentCategoryRepository },
        { DrizzleCategoriesRepository },
        { DrizzleDocumentProcessingRepository },
        { processDocumentJob },
        { createApp },
        { createDocumentService },
        { createCategoriesService },
        { createLogger },
      ] = await Promise.all([
        import("@axentra/db"),
        import("../apps/api/src/modules/documents/category.repository"),
        import("../apps/api/src/modules/categories/categories.repository"),
        import("../apps/worker/src/processors/document.processor.repository"),
        import("../apps/worker/src/processors/document.processor"),
        import("../apps/api/src/app"),
        import("../apps/api/src/modules/documents/documents.service"),
        import("../apps/api/src/modules/categories/categories.service"),
        import("@axentra/observability"),
      ]);

      const docId = crypto.randomUUID();
      createdDocumentIds.push(docId);
      // Neutral filename that cannot trigger filename fallback (F2)
      const neutralFilename = "doc-content-sample-a.pdf";
      const storageKey = `integration-tests/${docId}/${neutralFilename}`;

      await database.db.insert(documents).values({
        id: docId,
        title: neutralFilename,
        processingStatus: "queued",
      });

      await database.db.insert(documentFiles).values({
        documentId: docId,
        storageKey,
        originalName: neutralFilename,
        mimeType: "application/pdf",
        fileSize: 1024,
        fileExtension: "pdf",
      });

      const pdfContent = `%PDF-1.4
1 0 obj
<< /Author (Finance Lead) >>
endobj
2 0 obj
<< /Length 120 >>
stream
BT
/F1 12 Tf
(Dokumen ini berisi Reporting tahunan organisasi dan data rekapitulasi Reporting.) Tj
ET
endstream
endobj
%%EOF`;

      const filesMap = new Map<string, Uint8Array>();
      filesMap.set(storageKey, Buffer.from(pdfContent, "latin1"));
      const storage = createMockStorage(filesMap);

      const workerRepo = new DrizzleDocumentProcessingRepository(database.db);
      await processDocumentJob(
        {
          jobId: `job-${docId}`,
          documentId: docId,
          schemaVersion: 1,
          requestedAt: new Date().toISOString(),
        },
        { repository: workerRepo, storage },
      );

      // Verify category created in database
      const [doc] = await database.db
        .select()
        .from(documents)
        .where(inArray(documents.id, [docId]))
        .limit(1);

      expect(doc?.processingStatus).toBe("completed");
      expect(doc?.categoryId).not.toBeNull();

      for (const id of workerRepo.createdCategoryIds) {
        if (!createdCategoryIds.includes(id)) {
          createdCategoryIds.push(id);
        }
      }

      const [categoryRow] = await database.db
        .select()
        .from(categories)
        .where(inArray(categories.id, [doc?.categoryId ?? ""]))
        .limit(1);

      expect(categoryRow?.name).toBe("Reporting");
      expect(categoryRow?.slug).toBe("reporting");

      // Verify category download permission is inactive (default false)
      const [permissionRow] = await database.db
        .select()
        .from(categoryDownloadPermissions)
        .where(inArray(categoryDownloadPermissions.categoryId, [categoryRow?.id ?? ""]))
        .limit(1);

      expect(permissionRow).toBeDefined();
      expect(permissionRow?.downloadEnabled).toBe(false);

      // Test API endpoints
      const app = createApp({
        logger: createLogger({
          service: "axentra-api",
          environment: "test",
          version: "0.1.0",
          level: "fatal",
        }),
        version: "0.1.0",
        readinessChecks: [],
        tokenVerifier: {
          verifyToken: () => ({
            id: "usr-member",
            email: "member@axentra.local",
            role: "member_team",
            name: "Member User",
          }),
        },
        documentService: createDocumentService({
          categoryRepository: new DrizzleDocumentCategoryRepository(database.db),
        }),
        categoriesService: createCategoriesService(new DrizzleCategoriesRepository(database.db)),
      });

      // 1. GET /api/v1/documents/:id/category
      const docCatRes = await app.request(`/api/v1/documents/${docId}/category`, {
        method: "GET",
        headers: { Authorization: "Bearer test" },
      });
      expect(docCatRes.status).toBe(200);
      const docCatBody = (await docCatRes.json()) as DocumentCategoryResponse;
      expect(docCatBody.success).toBe(true);
      expect(docCatBody.data?.name).toBe("Reporting");
      expect(docCatBody.data?.downloadEnabled).toBe(false);

      // 2. GET /api/v1/categories
      const catListRes = await app.request("/api/v1/categories", {
        method: "GET",
        headers: { Authorization: "Bearer test" },
      });
      expect(catListRes.status).toBe(200);
      const catListBody = (await catListRes.json()) as ApiSuccessEnvelope<
        ReadonlyArray<CategorySummary>
      >;
      expect(catListBody.success).toBe(true);
      const reportingInList = catListBody.data.find((c) => c.slug === "reporting");
      expect(reportingInList).toBeDefined();
      expect(reportingInList?.downloadEnabled).toBe(false);
    },
  );

  integrationTest(
    "AC-05.02: assigns different categories for Reporting and Contract documents",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        { documents, documentFiles, categories },
        { DrizzleDocumentCategoryRepository },
        { DrizzleDocumentProcessingRepository },
        { processDocumentJob },
        { createApp },
        { createDocumentService },
        { createLogger },
      ] = await Promise.all([
        import("@axentra/db"),
        import("../apps/api/src/modules/documents/category.repository"),
        import("../apps/worker/src/processors/document.processor.repository"),
        import("../apps/worker/src/processors/document.processor"),
        import("../apps/api/src/app"),
        import("../apps/api/src/modules/documents/documents.service"),
        import("@axentra/observability"),
      ]);

      // Document 1 with neutral filename and Reporting content
      const reportingDocId = crypto.randomUUID();
      createdDocumentIds.push(reportingDocId);
      const neutralReportingFilename = "doc-content-sample-b.pdf";
      const storageKeyReporting = `integration-tests/${reportingDocId}/${neutralReportingFilename}`;

      await database.db.insert(documents).values({
        id: reportingDocId,
        title: neutralReportingFilename,
        processingStatus: "queued",
      });

      await database.db.insert(documentFiles).values({
        documentId: reportingDocId,
        storageKey: storageKeyReporting,
        originalName: neutralReportingFilename,
        mimeType: "application/pdf",
        fileSize: 1024,
        fileExtension: "pdf",
      });

      // Document 2 with neutral filename and Contract content
      const contractDocId = crypto.randomUUID();
      createdDocumentIds.push(contractDocId);
      const neutralContractFilename = "doc-content-sample-c.pdf";
      const storageKeyContract = `integration-tests/${contractDocId}/${neutralContractFilename}`;

      await database.db.insert(documents).values({
        id: contractDocId,
        title: neutralContractFilename,
        processingStatus: "queued",
      });

      await database.db.insert(documentFiles).values({
        documentId: contractDocId,
        storageKey: storageKeyContract,
        originalName: neutralContractFilename,
        mimeType: "application/pdf",
        fileSize: 1024,
        fileExtension: "pdf",
      });

      const reportingPdf = `%PDF-1.4
1 0 obj
<< /Author (Finance Lead) >>
endobj
2 0 obj
<< /Length 120 >>
stream
BT
/F1 12 Tf
(Dokumen ini menyajikan data Reporting operasional dan Reporting kinerja kuartal.) Tj
ET
endstream
endobj
%%EOF`;

      const contractPdf = `%PDF-1.4
1 0 obj
<< /Author (Legal Lead) >>
endobj
2 0 obj
<< /Length 120 >>
stream
BT
/F1 12 Tf
(Dokumen resmi Contract pengadaan dan kesepakatan Contract kerja sama antar pihak.) Tj
ET
endstream
endobj
%%EOF`;

      const filesMap = new Map<string, Uint8Array>();
      filesMap.set(storageKeyReporting, Buffer.from(reportingPdf, "latin1"));
      filesMap.set(storageKeyContract, Buffer.from(contractPdf, "latin1"));
      const storage = createMockStorage(filesMap);

      const workerRepo = new DrizzleDocumentProcessingRepository(database.db);
      await processDocumentJob(
        {
          jobId: `job-${reportingDocId}`,
          documentId: reportingDocId,
          schemaVersion: 1,
          requestedAt: new Date().toISOString(),
        },
        { repository: workerRepo, storage },
      );
      await processDocumentJob(
        {
          jobId: `job-${contractDocId}`,
          documentId: contractDocId,
          schemaVersion: 1,
          requestedAt: new Date().toISOString(),
        },
        { repository: workerRepo, storage },
      );

      // Verify both documents in database received distinct categories
      const [reportingDoc] = await database.db
        .select()
        .from(documents)
        .where(inArray(documents.id, [reportingDocId]))
        .limit(1);

      const [contractDoc] = await database.db
        .select()
        .from(documents)
        .where(inArray(documents.id, [contractDocId]))
        .limit(1);

      expect(reportingDoc?.categoryId).not.toBeNull();
      expect(contractDoc?.categoryId).not.toBeNull();
      expect(reportingDoc?.categoryId).not.toBe(contractDoc?.categoryId);

      // Track newly created category IDs from worker repository (F1: no snapshot comparison)
      for (const id of workerRepo.createdCategoryIds) {
        if (!createdCategoryIds.includes(id)) {
          createdCategoryIds.push(id);
        }
      }

      const [reportingCategory] = await database.db
        .select()
        .from(categories)
        .where(inArray(categories.id, [reportingDoc?.categoryId ?? ""]))
        .limit(1);
      const [contractCategory] = await database.db
        .select()
        .from(categories)
        .where(inArray(categories.id, [contractDoc?.categoryId ?? ""]))
        .limit(1);

      expect(reportingCategory?.name).toBe("Reporting");
      expect(contractCategory?.name).toBe("Contract");

      const app = createApp({
        logger: createLogger({
          service: "axentra-api",
          environment: "test",
          version: "0.1.0",
          level: "fatal",
        }),
        version: "0.1.0",
        readinessChecks: [],
        tokenVerifier: {
          verifyToken: () => ({
            id: "usr-member",
            email: "member@axentra.local",
            role: "member_team",
            name: "Member User",
          }),
        },
        documentService: createDocumentService({
          categoryRepository: new DrizzleDocumentCategoryRepository(database.db),
        }),
      });

      const resReporting = await app.request(`/api/v1/documents/${reportingDocId}/category`, {
        method: "GET",
        headers: { Authorization: "Bearer test" },
      });
      expect(resReporting.status).toBe(200);
      const bodyReporting = (await resReporting.json()) as DocumentCategoryResponse;
      expect(bodyReporting.success).toBe(true);
      expect(bodyReporting.data?.name).toBe("Reporting");
      expect(bodyReporting.data?.slug).toBe("reporting");
      expect(bodyReporting.data?.downloadEnabled).toBe(false);

      const resContract = await app.request(`/api/v1/documents/${contractDocId}/category`, {
        method: "GET",
        headers: { Authorization: "Bearer test" },
      });
      expect(resContract.status).toBe(200);
      const bodyContract = (await resContract.json()) as DocumentCategoryResponse;
      expect(bodyContract.success).toBe(true);
      expect(bodyContract.data?.name).toBe("Contract");
      expect(bodyContract.data?.slug).toBe("contract");
      expect(bodyContract.data?.downloadEnabled).toBe(false);
    },
  );

  integrationTest(
    "regression (F1): categories created externally after setup are never deleted by cleanup even if worker reuses them",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        { categories, categoryDownloadPermissions, documents, documentFiles },
        { DrizzleDocumentProcessingRepository },
        { processDocumentJob },
        { safeCleanupTestCategories },
      ] = await Promise.all([
        import("@axentra/db"),
        import("../apps/worker/src/processors/document.processor.repository"),
        import("../apps/worker/src/processors/document.processor"),
        import("./helpers/disposable-database"),
      ]);

      const externalCategoryId = crypto.randomUUID();
      const externalCategoryName = "Finance";
      const externalCategorySlug = "finance";

      // 1. Insert an external category created by another actor after setup snapshot
      await database.db.insert(categories).values({
        id: externalCategoryId,
        name: externalCategoryName,
        slug: externalCategorySlug,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await database.db.insert(categoryDownloadPermissions).values({
        categoryId: externalCategoryId,
        downloadEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Confirm category was created after the initial snapshot
      expect(preExistingCategoryIds.has(externalCategoryId)).toBe(false);

      const regDocId = crypto.randomUUID();
      const neutralFilename = "doc-finance-audit-record.pdf";
      const storageKey = `integration-tests/${regDocId}/${neutralFilename}`;

      // 2. Create document queued for processing
      await database.db.insert(documents).values({
        id: regDocId,
        title: neutralFilename,
        processingStatus: "queued",
      });
      await database.db.insert(documentFiles).values({
        documentId: regDocId,
        storageKey,
        originalName: neutralFilename,
        mimeType: "application/pdf",
        fileSize: 1024,
        fileExtension: "pdf",
      });

      // 3. Create PDF buffer containing 'finance' keyword in body text
      const pdfContent = `%PDF-1.4
1 0 obj
<< /Author (Corporate Treasurer) >>
endobj
2 0 obj
<< /Length 120 >>
stream
BT
/F1 12 Tf
(Dokumen ini memuat laporan finance dan keuangan operasional triwulan.) Tj
ET
endstream
endobj
%%EOF`;
      const filesMap = new Map<string, Uint8Array>();
      filesMap.set(storageKey, Buffer.from(pdfContent, "latin1"));
      const storage = createMockStorage(filesMap);

      try {
        // 4. Process the document through the worker pipeline
        const workerRepo = new DrizzleDocumentProcessingRepository(database.db);
        await processDocumentJob(
          {
            jobId: `job-${regDocId}`,
            documentId: regDocId,
            schemaVersion: 1,
            requestedAt: new Date().toISOString(),
          },
          { repository: workerRepo, storage },
        );

        // 5. Verify worker assigned and reused the external category
        const [processedDoc] = await database.db
          .select()
          .from(documents)
          .where(inArray(documents.id, [regDocId]))
          .limit(1);

        expect(processedDoc?.processingStatus).toBe("completed");
        expect(processedDoc?.categoryId).toBe(externalCategoryId);

        // Worker repository tracks ONLY categories actually inserted by this worker run.
        // Because externalCategoryId was reused, it is NOT in createdCategoryIds!
        expect(workerRepo.createdCategoryIds).not.toContain(externalCategoryId);
        expect(workerRepo.createdCategoryIds.length).toBe(0);

        // 6. Delete test document before running category cleanup (mimicking afterAll suite cleanup)
        await database.db
          .delete(documentFiles)
          .where(inArray(documentFiles.documentId, [regDocId]));
        await database.db.delete(documents).where(inArray(documents.id, [regDocId]));

        // 7. Execute multi-layer safe cleanup with workerRepo's tracked created categories
        const cleanupResult = await safeCleanupTestCategories(
          database,
          workerRepo.createdCategoryIds,
          { preExistingCategoryIds, databaseUrl },
        );

        // Verify the external category was never considered or deleted
        expect(cleanupResult.deletedCategoryIds).not.toContain(externalCategoryId);

        // Verify the external category remains intact in the database with original name & permission
        const [stillExists] = await database.db
          .select({ id: categories.id, name: categories.name })
          .from(categories)
          .where(inArray(categories.id, [externalCategoryId]))
          .limit(1);

        expect(stillExists).toBeDefined();
        expect(stillExists?.id).toBe(externalCategoryId);
        expect(stillExists?.name).toBe(externalCategoryName);

        const [permStillExists] = await database.db
          .select({
            id: categoryDownloadPermissions.id,
            downloadEnabled: categoryDownloadPermissions.downloadEnabled,
          })
          .from(categoryDownloadPermissions)
          .where(inArray(categoryDownloadPermissions.categoryId, [externalCategoryId]))
          .limit(1);

        expect(permStillExists).toBeDefined();
        expect(permStillExists?.downloadEnabled).toBe(true);
      } finally {
        // Explicitly clean up test fixtures
        await database.db
          .delete(documentFiles)
          .where(inArray(documentFiles.documentId, [regDocId]));
        await database.db.delete(documents).where(inArray(documents.id, [regDocId]));
        await database.db
          .delete(categoryDownloadPermissions)
          .where(inArray(categoryDownloadPermissions.categoryId, [externalCategoryId]));
        await database.db.delete(categories).where(inArray(categories.id, [externalCategoryId]));
      }
    },
  );

  integrationTest(
    "regression (F1): category created by test worker is preserved if another document references it",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        { categories, categoryDownloadPermissions, documents },
        { safeCleanupTestCategories },
      ] = await Promise.all([import("@axentra/db"), import("./helpers/disposable-database")]);

      const testCatId = crypto.randomUUID();
      const foreignDocId = crypto.randomUUID();

      // Simulate a category created during testing
      await database.db.insert(categories).values({
        id: testCatId,
        name: "Temporary Shared Test Cat",
        slug: `temp-shared-${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await database.db.insert(categoryDownloadPermissions).values({
        categoryId: testCatId,
        downloadEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Insert an external document referencing this category
      await database.db.insert(documents).values({
        id: foreignDocId,
        title: "Foreign Document",
        fileType: "application/pdf",
        fileSize: 1024,
        storageKey: `foreign/${foreignDocId}.pdf`,
        processingStatus: "completed",
        categoryId: testCatId,
        uploadedBy: "foreign-user",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      try {
        // Even though testCatId is in candidateCategoryIds, referential integrity guard must preserve it
        const cleanupResult = await safeCleanupTestCategories(database, [testCatId], {
          preExistingCategoryIds,
          databaseUrl,
        });

        expect(cleanupResult.skippedCategoryIds).toContain(testCatId);
        expect(cleanupResult.deletedCategoryIds).not.toContain(testCatId);

        // Verify category was not deleted
        const [stillExists] = await database.db
          .select({ id: categories.id })
          .from(categories)
          .where(inArray(categories.id, [testCatId]))
          .limit(1);

        expect(stillExists).toBeDefined();
        expect(stillExists?.id).toBe(testCatId);
      } finally {
        // Clean up test fixtures
        await database.db.delete(documents).where(inArray(documents.id, [foreignDocId]));
        await database.db
          .delete(categoryDownloadPermissions)
          .where(inArray(categoryDownloadPermissions.categoryId, [testCatId]));
        await database.db.delete(categories).where(inArray(categories.id, [testCatId]));
      }
    },
  );
});
