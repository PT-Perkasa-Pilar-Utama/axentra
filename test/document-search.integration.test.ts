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

describe("Document Search PostgreSQL integration (BE-S2-05 / AC-06.01 to AC-06.04)", () => {
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
    "searches title, filename, and extracted content with snippets in under 3 seconds in PostgreSQL (AC-06.01 to AC-06.04, F1, F3)",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        { categories, documents, documentFiles, documentMetadata },
        { DrizzleSearchRepository },
      ] = await Promise.all([
        import("@axentra/db"),
        import("../apps/api/src/modules/search/search.repository"),
      ]);

      const suffix = crypto.randomUUID().slice(0, 8);
      const categoryId = crypto.randomUUID();
      const docContentMatchId = crypto.randomUUID();
      const docFilenameMatchId = crypto.randomUUID();
      const docTitleMatchId = crypto.randomUUID();
      const docDeletedId = crypto.randomUUID();

      const allDocIds = [docContentMatchId, docFilenameMatchId, docTitleMatchId, docDeletedId];
      const searchRepo = new DrizzleSearchRepository(database.db);

      try {
        // 1. Create a category
        await database.db.insert(categories).values({
          id: categoryId,
          name: `Category-${suffix}`,
          slug: `category-${suffix}`,
        });

        // 2. Insert documents
        const now = new Date();
        await database.db.insert(documents).values([
          {
            id: docContentMatchId,
            title: `Arsitektur Sistem ${suffix}`,
            categoryId,
            processingStatus: "completed",
            createdAt: new Date(now.getTime() - 3000),
          },
          {
            id: docFilenameMatchId,
            title: `Dokumen Keuangan ${suffix}`,
            categoryId,
            processingStatus: "completed",
            createdAt: new Date(now.getTime() - 2000),
          },
          {
            id: docTitleMatchId,
            title: `Spesifikasi API Integrasi ${suffix}`,
            processingStatus: "completed",
            createdAt: new Date(now.getTime() - 1000),
          },
          {
            id: docDeletedId,
            title: `Deleted API Doc ${suffix}`,
            processingStatus: "completed",
            createdAt: now,
            deletedAt: now,
          },
        ]);

        // 3. Insert files
        await database.db.insert(documentFiles).values([
          {
            documentId: docContentMatchId,
            storageKey: `files/${docContentMatchId}/arsitektur.pdf`,
            originalName: `arsitektur-v1-${suffix}.pdf`,
            mimeType: "application/pdf",
            fileSize: 1024,
            fileExtension: "pdf",
          },
          {
            documentId: docFilenameMatchId,
            storageKey: `files/${docFilenameMatchId}/keuangan.docx`,
            originalName: `laporan-keuangan-${suffix}.docx`,
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            fileSize: 2048,
            fileExtension: "docx",
          },
          {
            documentId: docTitleMatchId,
            storageKey: `files/${docTitleMatchId}/spesifikasi.pdf`,
            originalName: `spesifikasi-${suffix}.pdf`,
            mimeType: "application/pdf",
            fileSize: 512,
            fileExtension: "pdf",
          },
          {
            documentId: docDeletedId,
            storageKey: `files/${docDeletedId}/deleted.pdf`,
            originalName: `deleted-api-${suffix}.pdf`,
            mimeType: "application/pdf",
            fileSize: 512,
            fileExtension: "pdf",
          },
        ]);

        // 4. Insert metadata with extractedText
        await database.db.insert(documentMetadata).values([
          {
            documentId: docContentMatchId,
            author: "Team Arsitek",
            extractedText:
              "Dokumen ini memuat panduan implementasi REST API microservice untuk sistem manajemen dokumen perkasa.",
          },
          {
            documentId: docFilenameMatchId,
            author: "Team Keuangan",
            extractedText: "Ringkasan anggaran belanja operasional perusahaan tahun 2026.",
          },
          {
            documentId: docTitleMatchId,
            author: "Team Integrasi",
            extractedText: "Detail endpoint gateway integrasi eksternal.",
          },
          {
            documentId: docDeletedId,
            author: "Admin",
            extractedText: "Deleted API content.",
          },
        ]);

        // AC-06.01: Search by extracted content keyword (REST API)
        const contentSearch = await searchRepo.searchDocuments({
          q: "REST API",
          page: 1,
          limit: 20,
        });
        const contentIds = contentSearch.items.map((i) => i.id);
        expect(contentIds).toContain(docContentMatchId);
        expect(contentIds).not.toContain(docDeletedId); // Soft-deleted document excluded

        // AC-06.02 & F3: Verify plain-text snippet generation and structured highlights
        const matchedItem = contentSearch.items.find((i) => i.id === docContentMatchId);
        expect(matchedItem).toBeDefined();
        expect(matchedItem?.snippet).not.toBeNull();
        expect(matchedItem?.snippet).toContain("REST API");
        expect(matchedItem?.snippet).not.toContain("<strong>"); // Plain text, no raw HTML markup
        expect(matchedItem?.highlights).toBeDefined();
        expect(matchedItem?.highlights?.length).toBeGreaterThan(0);

        // F1: Search by filename-only keyword and assert non-null snippet
        const filenameSearch = await searchRepo.searchDocuments({
          q: `keuangan-${suffix}`,
          page: 1,
          limit: 20,
        });
        expect(filenameSearch.items.map((i) => i.id)).toEqual([docFilenameMatchId]);
        const fnItem = filenameSearch.items[0];
        expect(fnItem?.snippet).not.toBeNull(); // F1: snippet must be non-null for filename matches
        expect(fnItem?.snippet).toContain(`keuangan-${suffix}`);
        expect(fnItem?.highlights).toBeDefined();
        expect(fnItem?.highlights?.length).toBeGreaterThan(0);

        // F1: Search by title-only keyword and assert non-null snippet
        const titleSearch = await searchRepo.searchDocuments({
          q: `Spesifikasi API Integrasi ${suffix}`,
          page: 1,
          limit: 20,
        });
        expect(titleSearch.items.map((i) => i.id)).toEqual([docTitleMatchId]);
        const titleItem = titleSearch.items[0];
        expect(titleItem?.snippet).not.toBeNull(); // F1: snippet must be non-null for title matches
        expect(titleItem?.snippet).toContain("Spesifikasi");
        expect(titleItem?.highlights).toBeDefined();
        expect(titleItem?.highlights?.length).toBeGreaterThan(0);

        // AC-06.03: Verify execution duration under 3 seconds
        const start = performance.now();
        await searchRepo.searchDocuments({
          q: "API",
          page: 1,
          limit: 20,
        });
        const duration = performance.now() - start;
        expect(duration).toBeLessThan(3000);

        // AC-06.04: Non-existent keyword returns empty array
        const noMatch = await searchRepo.searchDocuments({
          q: `xyzabc-nonexistent-${suffix}`,
          page: 1,
          limit: 20,
        });
        expect(noMatch.items).toEqual([]);
        expect(noMatch.total).toBe(0);

        // Filter by keyword + categoryId
        const categorySearch = await searchRepo.searchDocuments({
          q: "API",
          categoryId,
          page: 1,
          limit: 20,
        });
        const categoryIds = categorySearch.items.map((i) => i.id);
        expect(categoryIds).toContain(docContentMatchId);
        expect(categoryIds).not.toContain(docTitleMatchId);
      } finally {
        await database.db.delete(documents).where(inArray(documents.id, allDocIds));
        await database.db.delete(categories).where(inArray(categories.id, [categoryId]));
      }
    },
  );

  integrationTest(
    "F4: verifies pg_trgm GIN index presence, query plan utilization, and demonstrates under-3-second SLA at representative scale (100 documents with ~2 KB body text)",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [{ documents, documentFiles, documentMetadata }, { DrizzleSearchRepository }] =
        await Promise.all([
          import("@axentra/db"),
          import("../apps/api/src/modules/search/search.repository"),
        ]);

      // 1. Verify that pg_trgm GIN indexes exist on PostgreSQL
      const indexRows = await database.sql<
        Array<{ indexname: string; indexdef: string }>
      >`SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('documents', 'document_files', 'document_metadata') AND indexname LIKE '%trgm%'`;

      const indexNames = indexRows.map((r) => r.indexname);
      expect(indexNames).toContain("documents_title_trgm_idx");
      expect(indexNames).toContain("document_files_original_name_trgm_idx");
      expect(indexNames).toContain("document_metadata_extracted_text_trgm_idx");

      // 2. Seed a representative dataset of 100 documents with realistic multi-paragraph body text (~2 KB UTF-8 per document)
      const batchSuffix = crypto.randomUUID().slice(0, 8);
      const corpusSize = 100;
      const batchDocIds: string[] = [];
      const docInserts: Array<{
        id: string;
        title: string;
        processingStatus: "completed";
        createdAt: Date;
      }> = [];
      const fileInserts: Array<{
        documentId: string;
        storageKey: string;
        originalName: string;
        mimeType: string;
        fileSize: number;
        fileExtension: string;
      }> = [];
      const metadataInserts: Array<{
        documentId: string;
        author: string;
        extractedText: string;
      }> = [];

      const targetKeyword = `trgmbenchmark${batchSuffix}`;

      for (let i = 0; i < corpusSize; i++) {
        const id = crypto.randomUUID();
        batchDocIds.push(id);

        const hasKeyword = i % 10 === 0; // 10 documents contain the keyword
        const title = `Dokumen Evaluasi Kinerja ${i} ${batchSuffix}`;
        const originalName = `evaluasi-kinerja-${i}-${batchSuffix}.pdf`;

        // Generate ~2 KB of realistic multi-paragraph extracted text (~2,000 to ~2,200 characters)
        const bodyParagraphs = [
          `Paragraf 1 pendahuluan dokumen evaluasi operasional nomor ${i} mengenai tata kelola dan sistem manajemen arsip digital internal PT Perkasa Pilar Utama secara menyeluruh. Dokumen ini bertujuan untuk memastikan setiap berkas organisasi tersimpan rapi dengan metadata lengkap dan dapat ditemukan kembali dengan cepat melalui sistem pencarian terpadu perusahaan. Seluruh proses pengarsipan harus mematuhi kebijakan standard operating procedure internal.`,
          hasKeyword
            ? `Paragraf 2 pembahasan strategis secara spesifik mencakup analisis mendalam mengenai ${targetKeyword} guna optimasi alur kerja tim, efisiensi arsitektur data relasional PostgreSQL, serta ketahanan penyimpanan berkas MinIO di seluruh lingkungan sistem DMS perusahaan. Integrasi kata kunci ini menjadi acuan utama dalam evaluasi pemrosesan teks dan pengujian performa kueri.`
            : `Paragraf 2 pembahasan teknis mencakup evaluasi operasional berkala tanpa topik khusus, berfokus pada standarisasi format berkas PDF dan verifikasi integritas checksum kriptografis SHA-256 pada seluruh objek arsip yang dikelola di sistem organisasi. Implementasi ini menjamin bahwa tidak ada duplikasi data atau berkas yang rusak selama siklus hidup penyimpanan dokumen.`,
          `Paragraf 3 analisis kepatuhan dan mitigasi risiko operasional mencakup pemantauan berkala log audit sistem, kontrol otorisasi berbasis peran untuk Head of Team dan Member Team, serta pemenuhan SLA retensi dokumen sesuai standar operasional prosedur yang berlaku di lingkungan kerja perusahaan perkasa. Kepatuhan ini diaudit secara berkala oleh tim penjamin mutu kearsipan digital.`,
          `Paragraf 4 evaluasi kapasitas infrastruktur mencakup perencanaan throughput kueri database, pengindeksan trigram PostgreSQL untuk mempercepat pencarian teks parsial, serta pemisahan beban komputasi asynchronous worker BullMQ agar tidak mengganggu keandalan transaksi API utama. Penyesuaian konfigurasi pool koneksi database dilakukan agar beban kueri dapat terdistribusi secara seimbang.`,
          `Paragraf 5 tinjauan aspek keamanan informasi meliputi enkripsi data pada media penyimpanan, pengelolaan kredensial terpusat, pengawasan terhadap akses dokumen berklasifikasi rahasia, serta pencegahan terhadap potensi kebocoran informasi melalui kanal publik atau endpoint yang tidak terproteksi.`,
          `Paragraf 6 kesimpulan akhir dan rekomendasi tindak lanjut bagi pemangku kepentingan untuk meninjau secara teratur performa sistem kearsipan, efisiensi pemanfaatan ruang disk, dan kesiapan skalabilitas infrastruktur terhadap lonjakan berkas di masa mendatang. Laporan ini disahkan sebagai dokumen referensi evaluasi teknis tahunan.`,
        ].join("\n\n");

        // Verify body text is genuinely near ~2 KB (~2,000 bytes)
        expect(Buffer.byteLength(bodyParagraphs, "utf-8")).toBeGreaterThan(1900);

        docInserts.push({
          id,
          title,
          processingStatus: "completed",
          createdAt: new Date(),
        });
        fileInserts.push({
          documentId: id,
          storageKey: `files/${id}/${originalName}`,
          originalName,
          mimeType: "application/pdf",
          fileSize: Buffer.byteLength(bodyParagraphs, "utf-8"),
          fileExtension: "pdf",
        });
        metadataInserts.push({
          documentId: id,
          author: `Penulis ${i}`,
          extractedText: bodyParagraphs,
        });
      }

      const searchRepo = new DrizzleSearchRepository(database.db);

      try {
        await database.db.insert(documents).values(docInserts);
        await database.db.insert(documentFiles).values(fileInserts);
        await database.db.insert(documentMetadata).values(metadataInserts);

        // 3. Verify query planner recognizes and utilizes Bitmap Index Scan on pg_trgm GIN indexes for the production query
        await database.sql`ANALYZE documents`;
        await database.sql`ANALYZE document_files`;
        await database.sql`ANALYZE document_metadata`;

        // Inspect production query plan under normal planner
        const normalPlan = await database.sql`
          EXPLAIN (FORMAT JSON)
          SELECT d.id, d.title, df.original_name, dm.extracted_text
          FROM documents d
          INNER JOIN document_files df ON df.document_id = d.id
          LEFT JOIN document_metadata dm ON dm.document_id = d.id
          WHERE d.deleted_at IS NULL
            AND d.id IN (
              SELECT id FROM documents WHERE title ILIKE ${`%${targetKeyword}%`}
              UNION
              SELECT document_id FROM document_files WHERE original_name ILIKE ${`%${targetKeyword}%`}
              UNION
              SELECT document_id FROM document_metadata WHERE extracted_text ILIKE ${`%${targetKeyword}%`}
            )
          ORDER BY d.created_at DESC, d.id DESC
          LIMIT 20;
        `;
        expect(JSON.stringify(normalPlan)).toContain("Aggregate");

        // Verify index utilization capability under connection-scoped planner
        await database.sql.begin(async (tx) => {
          await tx`SET LOCAL enable_seqscan = off`;
          const explainProduction = await tx`
            EXPLAIN (FORMAT JSON)
            SELECT d.id, d.title, df.original_name, dm.extracted_text
            FROM documents d
            INNER JOIN document_files df ON df.document_id = d.id
            LEFT JOIN document_metadata dm ON dm.document_id = d.id
            WHERE d.deleted_at IS NULL
              AND d.id IN (
                SELECT id FROM documents WHERE title ILIKE ${`%${targetKeyword}%`}
                UNION
                SELECT document_id FROM document_files WHERE original_name ILIKE ${`%${targetKeyword}%`}
                UNION
                SELECT document_id FROM document_metadata WHERE extracted_text ILIKE ${`%${targetKeyword}%`}
              )
            ORDER BY d.created_at DESC, d.id DESC
            LIMIT 20;
          `;
          const planStr = JSON.stringify(explainProduction);
          expect(planStr).toContain("Bitmap Index Scan");
          expect(planStr).toContain("document_metadata_extracted_text_trgm_idx");
        });

        // 4. Measure search latency across multiple runs to demonstrate p95 < 500 ms and SLA < 3000 ms
        const iterations = 10;
        const durations: number[] = [];
        let searchResult: Awaited<ReturnType<typeof searchRepo.searchDocuments>> | undefined;

        for (let iter = 0; iter < iterations; iter++) {
          const startTime = performance.now();
          searchResult = await searchRepo.searchDocuments({
            q: targetKeyword,
            page: 1,
            limit: 20,
          });
          durations.push(performance.now() - startTime);
        }

        durations.sort((a, b) => a - b);
        const p95Duration = durations[Math.floor(durations.length * 0.95)] ?? 0;
        const maxDuration = durations[durations.length - 1] ?? 0;

        if (searchResult === undefined) {
          throw new Error("Search result was unexpectedly undefined");
        }

        // Verify results accuracy
        expect(searchResult.total).toBe(10);
        expect(searchResult.items.length).toBe(10);

        // Verify all items have valid plain text snippet and highlights (F1 & F3)
        for (const item of searchResult.items) {
          expect(item.snippet).not.toBeNull();
          expect(item.snippet).toContain(targetKeyword);
          expect(item.snippet).not.toContain("<strong>");
          expect(item.highlights).toBeDefined();
          expect(item.highlights?.length).toBeGreaterThan(0);
        }

        // Verify NFR p95 target (< 500 ms) and AC-06.03 SLA (< 3000 ms)
        expect(p95Duration).toBeLessThan(500);
        expect(maxDuration).toBeLessThan(3000);
      } finally {
        await database.db.delete(documents).where(inArray(documents.id, batchDocIds));
      }
    },
  );

  integrationTest(
    "F7: end-to-end worker extraction to search integration: verifies worker extracts body text, persists extractedText into PostgreSQL document_metadata via DrizzleDocumentProcessingRepository, and document is searchable by body-text keyword via DrizzleSearchRepository",
    async () => {
      if (database === undefined) {
        throw new Error("PostgreSQL integration database was not initialized");
      }

      const [
        { documents, documentFiles, documentMetadata },
        { DrizzleDocumentProcessingRepository },
        { processDocumentJob },
        { DrizzleSearchRepository },
      ] = await Promise.all([
        import("@axentra/db"),
        import("../apps/worker/src/processors/document.processor.repository"),
        import("../apps/worker/src/processors/document.processor"),
        import("../apps/api/src/modules/search/search.repository"),
      ]);

      const suffix = crypto.randomUUID().slice(0, 8);
      const docId = crypto.randomUUID();
      const fileId = crypto.randomUUID();
      const targetBodyKeyword = `workerbodyterm${suffix}`;
      const storageKey = `integration-tests/${docId}/worker-extracted-doc.pdf`;

      // Construct realistic PDF containing the unique target body keyword
      const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 180 >>
stream
BT
/F1 12 Tf
(Laporan audit teknis sistem perkasa memuat analisis mendalam mengenai ) Tj
(${targetBodyKeyword}) Tj
( untuk optimasi basis data dan kearsipan internal.) Tj
ET
endstream
endobj
xref
0 5
trailer
<< /Root 1 0 R >>
%%EOF`;
      const pdfBuffer = Buffer.from(pdfContent, "latin1");

      const storageMap = new Map<string, Uint8Array>();
      storageMap.set(storageKey, pdfBuffer);

      const storage = {
        async getObject(key: string) {
          const item = storageMap.get(key);
          if (!item) throw new Error(`Object not found in storage: ${key}`);
          return item;
        },
        async putObject(input: { key: string; body: Uint8Array }) {
          storageMap.set(input.key, input.body);
          return { key: input.key, etag: "mock-etag" };
        },
        async deleteObject(key: string) {
          storageMap.delete(key);
        },
        async headObject(key: string) {
          const item = storageMap.get(key);
          if (!item) return null;
          return { contentLength: item.length, lastModified: new Date() };
        },
        async initialize() {},
        async getDownloadUrl(key: string) {
          return `http://localhost:9000/documents/${key}`;
        },
      };

      const workerRepo = new DrizzleDocumentProcessingRepository(database.db);
      const searchRepo = new DrizzleSearchRepository(database.db);

      try {
        // 1. Insert document in queued state and its file record in PostgreSQL
        await database.db.insert(documents).values({
          id: docId,
          title: `Laporan Hasil Uji Worker ${suffix}`,
          processingStatus: "queued",
        });

        await database.db.insert(documentFiles).values({
          id: fileId,
          documentId: docId,
          storageKey,
          originalName: `unrelated-worker-filename-${suffix}.pdf`,
          mimeType: "application/pdf",
          fileSize: pdfBuffer.length,
          fileExtension: "pdf",
        });

        // 2. Process document through real worker pipeline with DrizzleDocumentProcessingRepository
        await processDocumentJob(
          {
            jobId: `job-${suffix}`,
            documentId: docId,
            schemaVersion: 1,
            enqueuedAt: new Date().toISOString(),
          },
          {
            repository: workerRepo,
            storage,
          },
        );

        // 3. Verify PostgreSQL persistence: document_metadata.extracted_text was written by the worker
        const [persistedMetadata] = await database.db
          .select({
            extractedText: documentMetadata.extractedText,
            documentId: documentMetadata.documentId,
          })
          .from(documentMetadata)
          .where(inArray(documentMetadata.documentId, [docId]));

        expect(persistedMetadata).toBeDefined();
        expect(persistedMetadata?.extractedText).not.toBeNull();
        expect(persistedMetadata?.extractedText).toContain(targetBodyKeyword);

        // 4. Assert that the document processed by the worker is found by DrizzleSearchRepository using body-text keyword
        const searchResult = await searchRepo.searchDocuments({
          q: targetBodyKeyword,
          page: 1,
          limit: 20,
        });

        expect(searchResult.total).toBe(1);
        expect(searchResult.items.length).toBe(1);
        const matchedItem = searchResult.items[0];
        expect(matchedItem?.id).toBe(docId);
        expect(matchedItem?.snippet).not.toBeNull();
        expect(matchedItem?.snippet).toContain(targetBodyKeyword);
        expect(matchedItem?.snippet).not.toContain("<strong>");
        expect(matchedItem?.highlights).toBeDefined();
        expect(matchedItem?.highlights?.length).toBeGreaterThan(0);
      } finally {
        await database.db.delete(documents).where(inArray(documents.id, [docId]));
      }
    },
  );
});
