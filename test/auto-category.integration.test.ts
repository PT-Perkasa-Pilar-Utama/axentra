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
  const createdCategorySlugs = ["reporting", "contract"];

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
    if (database !== undefined) {
      const { documents, categories } = await import("@axentra/db");
      if (createdDocumentIds.length > 0) {
        await database.db.delete(documents).where(inArray(documents.id, createdDocumentIds));
      }
      await database.db.delete(categories).where(inArray(categories.slug, createdCategorySlugs));
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
      const storageKey = `integration-tests/${docId}/laporan-kinerja.pdf`;

      await database.db.insert(documents).values({
        id: docId,
        title: "Laporan Kinerja Q3.pdf",
        processingStatus: "queued",
      });

      await database.db.insert(documentFiles).values({
        documentId: docId,
        storageKey,
        originalName: "Laporan Kinerja Q3.pdf",
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
(Dokumen ini berisi Reporting tahunan keuangan organisasi dan laporan rekapitulasi Reporting.) Tj
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
        { documents, documentFiles },
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

      const contractDocId = crypto.randomUUID();
      createdDocumentIds.push(contractDocId);
      const storageKey = `integration-tests/${contractDocId}/surat-perjanjian.pdf`;

      await database.db.insert(documents).values({
        id: contractDocId,
        title: "Perjanjian Kerjasama.pdf",
        processingStatus: "queued",
      });

      await database.db.insert(documentFiles).values({
        documentId: contractDocId,
        storageKey,
        originalName: "Perjanjian Kerjasama.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        fileExtension: "pdf",
      });

      const pdfContent = `%PDF-1.4
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
      filesMap.set(storageKey, Buffer.from(pdfContent, "latin1"));
      const storage = createMockStorage(filesMap);

      const workerRepo = new DrizzleDocumentProcessingRepository(database.db);
      await processDocumentJob(
        {
          jobId: `job-${contractDocId}`,
          documentId: contractDocId,
          schemaVersion: 1,
          requestedAt: new Date().toISOString(),
        },
        { repository: workerRepo, storage },
      );

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

      const res = await app.request(`/api/v1/documents/${contractDocId}/category`, {
        method: "GET",
        headers: { Authorization: "Bearer test" },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as DocumentCategoryResponse;
      expect(body.success).toBe(true);
      expect(body.data?.name).toBe("Contract");
      expect(body.data?.slug).toBe("contract");
      expect(body.data?.downloadEnabled).toBe(false);
    },
  );
});
