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

  beforeAll(async () => {
    if (!runIntegrationTests) return;

    const [{ loadApiConfigFromRuntime }, db] = await Promise.all([
      import("@axentra/config"),
      import("@axentra/db"),
    ]);
    closeDatabase = db.closeDatabase;
    createDatabaseClient = db.createDatabaseClient;
    const config = loadApiConfigFromRuntime();

    // Safety guard: run only against an isolated, disposable database (F1)
    const isDisposable =
      config.DATABASE_URL.includes("localhost") ||
      config.DATABASE_URL.includes("127.0.0.1") ||
      config.DATABASE_URL.includes("test");
    if (!isDisposable) {
      throw new Error(
        "Safety guard: auto-category integration tests must only be run against an isolated, disposable database.",
      );
    }

    database = createDatabaseClient(config.DATABASE_URL);
    await db.checkDatabase(database);

    // Snapshot pre-existing categories so cleanup NEVER deletes data not created by this test (F1)
    const preExisting = await database.db.select({ id: db.categories.id }).from(db.categories);
    preExistingCategoryIds = new Set(preExisting.map((c) => c.id));
  });

  afterAll(async () => {
    if (database !== undefined) {
      const { documents, documentFiles, categories, categoryDownloadPermissions } =
        await import("@axentra/db");

      // 1. Clean up only documents created by this test suite
      if (createdDocumentIds.length > 0) {
        await database.db
          .delete(documentFiles)
          .where(inArray(documentFiles.documentId, createdDocumentIds));
        await database.db.delete(documents).where(inArray(documents.id, createdDocumentIds));
      }

      // 2. Clean up ONLY category records created by this test suite by ID (F1)
      // Never delete categories based only on their names or slugs!
      if (createdCategoryIds.length > 0) {
        await database.db
          .delete(categoryDownloadPermissions)
          .where(inArray(categoryDownloadPermissions.categoryId, createdCategoryIds));
        await database.db.delete(categories).where(inArray(categories.id, createdCategoryIds));
      }

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

      if (
        doc?.categoryId &&
        !preExistingCategoryIds.has(doc.categoryId) &&
        !createdCategoryIds.includes(doc.categoryId)
      ) {
        createdCategoryIds.push(doc.categoryId);
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

      // Track newly created category IDs for safe cleanup (F1)
      if (
        reportingDoc?.categoryId &&
        !preExistingCategoryIds.has(reportingDoc.categoryId) &&
        !createdCategoryIds.includes(reportingDoc.categoryId)
      ) {
        createdCategoryIds.push(reportingDoc.categoryId);
      }
      if (
        contractDoc?.categoryId &&
        !preExistingCategoryIds.has(contractDoc.categoryId) &&
        !createdCategoryIds.includes(contractDoc.categoryId)
      ) {
        createdCategoryIds.push(contractDoc.categoryId);
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
});
