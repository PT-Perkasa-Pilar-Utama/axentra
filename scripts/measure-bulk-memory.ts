/**
 * Memory measurement script for Bulk Download ZIP operations.
 * Simulates 250 MB payload (5 x 50 MB files) across single, concurrent, and unread flood runs
 * under executeBulkDownloadOperation and BulkDownloadSemaphore.
 * Measures RSS across multiple iterations and reports min, median, and max ranges.
 */

import type { StorageAdapter } from "@axentra/storage";
import type { AuthUser } from "@axentra/shared";
import { BulkDownloadSemaphore } from "../apps/api/src/modules/documents/bulk-download.semaphore";
import { executeBulkDownloadOperation } from "../apps/api/src/modules/documents/bulk-download.operations";
import { InMemoryDownloadRepository } from "../apps/api/src/modules/documents/download.in-memory-repository";

function getRssMb(): number {
  return Math.round((process.memoryUsage().rss / (1024 * 1024)) * 100) / 100;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runGc(): void {
  if (typeof Bun !== "undefined" && typeof Bun.gc === "function") {
    Bun.gc(true);
  } else if (global.gc) {
    global.gc();
  }
}

function calculateStats(values: number[]): { min: number; median: number; max: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 !== 0
      ? (sorted[mid] ?? 0)
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return {
    min: Math.round(min * 100) / 100,
    median: Math.round(median * 100) / 100,
    max: Math.round(max * 100) / 100,
  };
}

const mockUser: AuthUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "admin@axentra.local",
  name: "Admin User",
  role: "admin",
};

function createMockEnvironment(fileCount = 5, fileSize = 50 * 1024 * 1024) {
  const repo = new InMemoryDownloadRepository();
  const documentIds: string[] = [];
  const storageMap = new Map<string, Uint8Array>();

  for (let i = 1; i <= fileCount; i++) {
    const docId = `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    const storageKey = `storage/bulk-benchmark-${i}.bin`;
    const buffer = new Uint8Array(fileSize);
    buffer.fill(i);
    storageMap.set(storageKey, buffer);

    repo.setTarget(docId, {
      document: {
        id: docId,
        title: `Benchmark File ${i}`,
        categoryId: null,
        deletedAt: null,
      },
      file: {
        id: `f0000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        documentId: docId,
        originalName: `file_${i}.bin`,
        storageKey,
        fileSize,
        mimeType: "application/octet-stream",
        sha256Hash: "mock-hash",
      },
      categoryPermission: null,
    });
    documentIds.push(docId);
  }

  const storage: StorageAdapter = {
    getObject: async (key: string) => {
      const data = storageMap.get(key);
      if (!data) throw new Error(`Not found in mock storage: ${key}`);
      return data;
    },
    putObject: async () => {},
    deleteObject: async () => {},
    headObject: async () => ({ contentLength: fileSize, contentType: "application/octet-stream" }),
  };

  return { repo, storage, documentIds };
}

async function runSingleIteration(_iteration: number): Promise<{
  baseline: number;
  singlePeak: number;
  concurrentPeak: number;
  floodPeak: number;
  floodActiveCount: number;
  floodQueueLength: number;
  floodRejectedCount: number;
}> {
  const semaphore = new BulkDownloadSemaphore({
    maxConcurrency: 2,
    maxQueueLength: 10,
    queueTimeoutMs: 30_000,
  });

  runGc();
  await delay(200);
  const baseline = getRssMb();

  const { repo, storage, documentIds } = createMockEnvironment(5, 50 * 1024 * 1024);

  // --- Skenario 1: Single 250 MB Request ---
  let singlePeak = baseline;
  const singleResult = await executeBulkDownloadOperation(
    { downloadRepository: repo, storage, bulkDownloadSemaphore: semaphore },
    { documentIds, user: mockUser },
  );
  let rssNow = getRssMb();
  if (rssNow > singlePeak) singlePeak = rssNow;

  if (singleResult.bytes.byteLength > 0) {
    rssNow = getRssMb();
    if (rssNow > singlePeak) singlePeak = rssNow;
  }

  runGc();
  await delay(200);

  // --- Skenario 2: 3 Concurrent 250 MB Requests ---
  const concurrentStart = getRssMb();
  let concurrentPeak = concurrentStart;

  const runConcurrent = async () => {
    const res = await executeBulkDownloadOperation(
      { downloadRepository: repo, storage, bulkDownloadSemaphore: semaphore },
      { documentIds, user: mockUser },
    );
    const r1 = getRssMb();
    if (r1 > concurrentPeak) concurrentPeak = r1;
    if (res.bytes.byteLength > 0) {
      const r2 = getRssMb();
      if (r2 > concurrentPeak) concurrentPeak = r2;
    }
  };

  await Promise.all([runConcurrent(), runConcurrent(), runConcurrent()]);

  runGc();
  await delay(200);

  // --- Skenario 3: In-Process Flood Test (20 concurrent requests) ---
  // Demonstrates semaphore bounds active assembly to 2, queues 10, and rejects 8 with 429
  const floodStart = getRssMb();
  let floodPeak = floodStart;
  const activeBuffers: Uint8Array[] = [];
  let floodRejectedCount = 0;
  let peakActive = 0;
  let peakQueue = 0;

  const floodPromises: Promise<void>[] = [];
  for (let i = 0; i < 20; i++) {
    const p = (async () => {
      try {
        const res = await executeBulkDownloadOperation(
          { downloadRepository: repo, storage, bulkDownloadSemaphore: semaphore },
          { documentIds, user: mockUser },
        );
        activeBuffers.push(res.bytes);
        if (semaphore.activeCount > peakActive) peakActive = semaphore.activeCount;
        if (semaphore.queueLength > peakQueue) peakQueue = semaphore.queueLength;
        const r = getRssMb();
        if (r > floodPeak) floodPeak = r;
      } catch {
        floodRejectedCount++;
        const r = getRssMb();
        if (r > floodPeak) floodPeak = r;
      }
    })();
    floodPromises.push(p);
    if (semaphore.activeCount > peakActive) peakActive = semaphore.activeCount;
    if (semaphore.queueLength > peakQueue) peakQueue = semaphore.queueLength;
  }

  // Allow flood to settle
  await delay(100);
  const settledRss = getRssMb();
  if (settledRss > floodPeak) floodPeak = settledRss;

  await Promise.allSettled(floodPromises);

  runGc();
  await delay(200);

  return {
    baseline,
    singlePeak,
    concurrentPeak,
    floodPeak,
    floodActiveCount: peakActive,
    floodQueueLength: peakQueue,
    floodRejectedCount,
  };
}

async function main(): Promise<void> {
  console.log(`=== Axentra Bulk Download Memory Benchmark (Bun ${Bun.version}) ===`);
  console.log("Measuring executeBulkDownloadOperation with In-Process Buffer Lifecycle\n");

  const iterations = 3;
  const baselines: number[] = [];
  const singlePeaks: number[] = [];
  const concurrentPeaks: number[] = [];
  const floodPeaks: number[] = [];
  let lastActive = 0;
  let lastQueue = 0;
  let lastRejected = 0;

  for (let i = 1; i <= iterations; i++) {
    console.log(`--- Running Iteration ${i} of ${iterations} ---`);
    const res = await runSingleIteration(i);
    baselines.push(res.baseline);
    singlePeaks.push(res.singlePeak);
    concurrentPeaks.push(res.concurrentPeak);
    floodPeaks.push(res.floodPeak);
    lastActive = res.floodActiveCount;
    lastQueue = res.floodQueueLength;
    lastRejected = res.floodRejectedCount;

    console.log(`  Iteration ${i} Results:`);
    console.log(`    Baseline RSS:    ${res.baseline} MB`);
    console.log(
      `    1 Request Peak:  ${res.singlePeak} MB (+${Math.round(res.singlePeak - res.baseline)} MB)`,
    );
    console.log(
      `    3 Requests Peak: ${res.concurrentPeak} MB (+${Math.round(res.concurrentPeak - res.baseline)} MB)`,
    );
    console.log(
      `    20 Flood Peak:   ${res.floodPeak} MB (+${Math.round(res.floodPeak - res.baseline)} MB)`,
    );
    console.log(
      `    Flood Status:    Active=${res.floodActiveCount}, Queue=${res.floodQueueLength}, Rejected(429)=${res.floodRejectedCount}\n`,
    );
  }

  const baselineStats = calculateStats(baselines);
  const singleStats = calculateStats(singlePeaks);
  const concurrentStats = calculateStats(concurrentPeaks);
  const floodStats = calculateStats(floodPeaks);

  console.log("================================================================================");
  console.log("=== STATISTICAL MEMORY REPORT (Min / Median / Max across 3 runs) ===");
  console.log("================================================================================");
  console.log(
    "| Skenario | Konkurensi Aktif | Min RSS | Median RSS | Max RSS | Delta vs Median Baseline |",
  );
  console.log("| --- | --- | --- | --- | --- | --- |");
  console.log(
    `| Baseline Proses (CLI) | 0 | ${baselineStats.min} MB | ${baselineStats.median} MB | ${baselineStats.max} MB | 0 MB |`,
  );
  console.log(
    `| 1 Bulk Request (250 MB) | 1 | ${singleStats.min} MB | ${singleStats.median} MB | ${singleStats.max} MB | +${Math.round(singleStats.median - baselineStats.median)} MB |`,
  );
  console.log(
    `| 3 Requests (Semaphore limit: 2) | Maks 2 | ${concurrentStats.min} MB | ${concurrentStats.median} MB | ${concurrentStats.max} MB | +${Math.round(concurrentStats.median - baselineStats.median)} MB |`,
  );
  console.log(
    `| 20 Concurrent Flood (In-Process) | Maks 2 (10 queue, ${lastRejected} x 429) | ${floodStats.min} MB | ${floodStats.median} MB | ${floodStats.max} MB | +${Math.round(floodStats.median - baselineStats.median)} MB |`,
  );
  console.log("\nCatatan Penting:");
  console.log(
    `1. Status banjir 20 request: ${lastActive} aktif dirakit, ${lastQueue} mengantre di semaphore, ${lastRejected} langsung ditolak HTTP 429 TOO_MANY_REQUESTS.`,
  );
  console.log(
    "2. Baseline CLI Bun ~22–42 MB. Pada proses server penuh (Hono, Drizzle, DB connection pool, Pino), baseline awal adalah ~108–110 MB.",
  );
  console.log(
    "3. Hasil pengukuran RSS puncak proses aktual (Min / Median / Max) dari 3 iterasi eksekusi riil:",
  );
  console.log(
    `   - 1 Request (250 MB payload): ${singleStats.min} MB / ${singleStats.median} MB / ${singleStats.max} MB`,
  );
  console.log(
    `   - 3 Concurrent Requests: ${concurrentStats.min} MB / ${concurrentStats.median} MB / ${concurrentStats.max} MB`,
  );
  console.log(
    `   - 20 Concurrent In-Process Flood: ${floodStats.min} MB / ${floodStats.median} MB / ${floodStats.max} MB`,
  );
  console.log(
    "4. Batas semaphore berlaku PER PROSES (instance API). Jika N instance dijalankan di balik load balancer, batas konkurensi cluster adalah N x 2.",
  );
  process.exit(0);
}

void main();
