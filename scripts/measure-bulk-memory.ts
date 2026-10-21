/**
 * Memory measurement script for Bulk Download ZIP operations (F7, F10).
 * Simulates 250 MB payload (5 x 50 MB files) across single and concurrent runs
 * under BulkDownloadSemaphore to measure peak RSS memory consumption.
 */

import { BulkDownloadSemaphore } from "../apps/api/src/modules/documents/bulk-download.semaphore";
import { createZipArchive, type ZipEntry } from "../apps/api/src/modules/documents/zip.writer";

function getRssMb(): number {
  return Math.round((process.memoryUsage().rss / (1024 * 1024)) * 100) / 100;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateBulkRequest(
  id: number,
  semaphore: BulkDownloadSemaphore,
  onStage?: (stage: string, rss: number) => void,
): Promise<void> {
  const release = await semaphore.acquire();
  try {
    onStage?.(`Req ${id}: Slot Acquired`, getRssMb());

    // 1. Prefetch 5 x 50 MB = 250 MB payload
    const entries: ZipEntry[] = [];
    for (let i = 0; i < 5; i++) {
      const buffer = new Uint8Array(50 * 1024 * 1024); // 50 MB
      buffer.fill(i + 1);
      entries.push({
        name: `req${id}_document_${i + 1}.bin`,
        content: buffer,
      });
    }
    onStage?.(`Req ${id}: 250 MB Prefetched`, getRssMb());

    // 2. Assemble continuous ZIP archive
    const archive = createZipArchive(entries);
    onStage?.(`Req ${id}: ZIP Archive Created (${archive.byteLength} bytes)`, getRssMb());

    // Keep active briefly to simulate concurrent network transmission
    await delay(100);
  } finally {
    release();
    onStage?.(`Req ${id}: Slot Released`, getRssMb());
  }
}

async function main(): Promise<void> {
  console.log("=== Axentra Bulk Download Memory Benchmark (Bun) ===\n");
  const baselineRss = getRssMb();
  console.log(`Baseline Process RSS: ${baselineRss} MB\n`);

  const semaphore = new BulkDownloadSemaphore({ maxConcurrency: 2, maxQueueLength: 5 });

  console.log("--- Test 1: Single 250 MB Request ---");
  let singlePeak = baselineRss;
  await simulateBulkRequest(1, semaphore, (stage, rss) => {
    if (rss > singlePeak) singlePeak = rss;
    console.log(`  [${stage}] -> RSS: ${rss} MB`);
  });
  console.log(
    `Peak RSS for Single Request: ${singlePeak} MB (+${Math.round(singlePeak - baselineRss)} MB)\n`,
  );

  // Force GC if available or pause
  if (global.gc) global.gc();
  await delay(200);

  console.log("--- Test 2: 3 Concurrent Requests under Semaphore (maxConcurrency = 2) ---");
  const concurrentBaseline = getRssMb();
  let concurrentPeak = concurrentBaseline;

  const req1 = simulateBulkRequest(1, semaphore, (stage, rss) => {
    if (rss > concurrentPeak) concurrentPeak = rss;
    console.log(`  [${stage}] -> RSS: ${rss} MB`);
  });
  const req2 = simulateBulkRequest(2, semaphore, (stage, rss) => {
    if (rss > concurrentPeak) concurrentPeak = rss;
    console.log(`  [${stage}] -> RSS: ${rss} MB`);
  });
  const req3 = simulateBulkRequest(3, semaphore, (stage, rss) => {
    if (rss > concurrentPeak) concurrentPeak = rss;
    console.log(`  [${stage}] -> RSS: ${rss} MB`);
  });

  await Promise.all([req1, req2, req3]);

  console.log(
    `\nPeak RSS with 3 requests (bounded at 2 concurrent): ${concurrentPeak} MB (+${Math.round(concurrentPeak - concurrentBaseline)} MB)`,
  );
  console.log("\nSummary Table:");
  console.log("| Skenario | Konkurensi Aktif | Puncak RSS | Kenaikan RSS vs Baseline |");
  console.log("| --- | --- | --- | --- |");
  console.log(`| Baseline Proses | 0 | ${baselineRss} MB | 0 MB |`);
  console.log(
    `| 1 Bulk Request (250 MB) | 1 | ${singlePeak} MB | +${Math.round(singlePeak - baselineRss)} MB |`,
  );
  console.log(
    `| 3 Bulk Requests (Semaphore maxConcurrency: 2) | Maks 2 | ${concurrentPeak} MB | +${Math.round(concurrentPeak - concurrentBaseline)} MB |`,
  );
}

void main();
