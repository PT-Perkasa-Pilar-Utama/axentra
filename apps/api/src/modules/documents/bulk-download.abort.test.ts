import { describe, expect, test } from "bun:test";
import { createLogger } from "@axentra/observability";
import type { StorageAdapter } from "@axentra/storage";
import type { AuthUser } from "@axentra/shared";
import { executeBulkDownloadOperation } from "./bulk-download.operations";
import { BulkDownloadByteBudget } from "./bulk-download.byte-budget";
import { BULK_DOWNLOAD_ABORTED_MESSAGE, BulkDownloadSemaphore } from "./bulk-download.semaphore";
import {
  InMemoryDownloadRepository,
  type DownloadTargetRecord,
  type IDownloadRepository,
} from "./download.repository";

// F15: an aborted bulk download must not write an audit event. These tests abort at each point before the
// audit unit of work and assert that no transaction starts and no audit row is recorded.

const CATEGORY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FIRST_DOC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECOND_DOC_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FILE_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

const memberUser: AuthUser = {
  id: "usr-member-1",
  email: "member@axentra.local",
  role: "member_team",
  name: "Member User",
};

const silentLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

function buildTarget(documentId: string): DownloadTargetRecord {
  return {
    document: {
      id: documentId,
      title: "laporan.pdf",
      categoryId: CATEGORY_ID,
      processingStatus: "completed",
      deletedAt: null,
    },
    file: {
      id: `file-${documentId}`,
      storageKey: `documents/${documentId}/laporan.pdf`,
      originalName: `laporan-${documentId.slice(0, 4)}.pdf`,
      mimeType: "application/pdf",
      fileSize: FILE_BYTES.byteLength,
      fileExtension: "pdf",
    },
    categoryPermission: { downloadEnabled: true },
  };
}

// Counts audit transactions so a test can prove none started.
class CountingDownloadRepository extends InMemoryDownloadRepository {
  public transactionCalls = 0;

  public override async transaction<T>(
    callback: (txRepo: IDownloadRepository) => Promise<T>,
  ): Promise<T> {
    this.transactionCalls++;
    return await super.transaction(callback);
  }
}

function createRepository(): CountingDownloadRepository {
  const repository = new CountingDownloadRepository();
  repository.setTarget(FIRST_DOC_ID, buildTarget(FIRST_DOC_ID));
  repository.setTarget(SECOND_DOC_ID, buildTarget(SECOND_DOC_ID));
  return repository;
}

function createStorage(getObject: StorageAdapter["getObject"]): StorageAdapter {
  return {
    initialize: async () => {},
    checkHealth: async () => {},
    putObject: async () => {},
    getObject,
    deleteObject: async () => {},
    headObject: async (key) => ({
      key,
      contentLength: FILE_BYTES.byteLength,
      contentType: "application/pdf",
      checksumSha256: undefined,
    }),
    createDownloadUrl: async (key) => `https://storage.test/${key}`,
    close: async () => {},
  };
}

function run(
  repository: IDownloadRepository,
  storage: StorageAdapter,
  options: {
    signal?: AbortSignal;
    semaphore?: BulkDownloadSemaphore;
    budget?: BulkDownloadByteBudget;
  } = {},
): Promise<unknown> {
  return executeBulkDownloadOperation(
    {
      downloadRepository: repository,
      storage,
      logger: silentLogger,
      bulkDownloadSemaphore: options.semaphore ?? new BulkDownloadSemaphore({ maxConcurrency: 2 }),
      bulkDownloadByteBudget: options.budget ?? new BulkDownloadByteBudget(1024 * 1024),
    },
    {
      documentIds: [FIRST_DOC_ID, SECOND_DOC_ID],
      user: memberUser,
      signal: options.signal,
    },
  );
}

describe("bulk download abort before audit (F15)", () => {
  test("writes no audit event when the client aborts during the last object read", async () => {
    const repository = createRepository();
    const controller = new AbortController();
    let reads = 0;
    const storage = createStorage(async () => {
      reads++;
      if (reads === 2) controller.abort();
      return FILE_BYTES;
    });

    await expect(run(repository, storage, { signal: controller.signal })).rejects.toThrow(
      BULK_DOWNLOAD_ABORTED_MESSAGE,
    );

    expect(repository.getRecordedAuditEvents()).toHaveLength(0);
    expect(repository.transactionCalls).toBe(0);
  });

  test("stops before the next object read once the client has aborted", async () => {
    const repository = createRepository();
    const controller = new AbortController();
    let reads = 0;
    const storage = createStorage(async () => {
      reads++;
      controller.abort();
      return FILE_BYTES;
    });

    await expect(run(repository, storage, { signal: controller.signal })).rejects.toThrow(
      BULK_DOWNLOAD_ABORTED_MESSAGE,
    );

    expect(reads).toBe(1);
    expect(repository.getRecordedAuditEvents()).toHaveLength(0);
    expect(repository.transactionCalls).toBe(0);
  });

  test("stops waiting on a storage read that never completes, then releases the slot and reservation", async () => {
    const repository = createRepository();
    const controller = new AbortController();
    const semaphore = new BulkDownloadSemaphore({ maxConcurrency: 1 });
    const budget = new BulkDownloadByteBudget(1024 * 1024);
    const storage = createStorage(() => new Promise<Uint8Array>(() => {}));

    const pending = run(repository, storage, {
      signal: controller.signal,
      semaphore,
      budget,
    });
    await Bun.sleep(10);
    expect(semaphore.activeCount).toBe(1);
    expect(budget.reservedBytes).toBeGreaterThan(0);

    controller.abort();

    await expect(pending).rejects.toThrow(BULK_DOWNLOAD_ABORTED_MESSAGE);
    expect(semaphore.activeCount).toBe(0);
    expect(budget.reservedBytes).toBe(0);
    expect(repository.getRecordedAuditEvents()).toHaveLength(0);
    expect(repository.transactionCalls).toBe(0);
  });

  test("reads no storage and writes no audit event when the signal is already aborted", async () => {
    const repository = createRepository();
    const controller = new AbortController();
    controller.abort();
    let reads = 0;
    const storage = createStorage(async () => {
      reads++;
      return FILE_BYTES;
    });

    await expect(run(repository, storage, { signal: controller.signal })).rejects.toThrow(
      BULK_DOWNLOAD_ABORTED_MESSAGE,
    );

    expect(reads).toBe(0);
    expect(repository.getRecordedAuditEvents()).toHaveLength(0);
    expect(repository.transactionCalls).toBe(0);
  });

  test("writes the audit events for a request that is not aborted, as the control case", async () => {
    const repository = createRepository();
    const storage = createStorage(async () => FILE_BYTES);

    await run(repository, storage, { signal: new AbortController().signal });

    expect(repository.transactionCalls).toBe(1);
    expect(repository.getRecordedAuditEvents()).toHaveLength(2);
  });
});
