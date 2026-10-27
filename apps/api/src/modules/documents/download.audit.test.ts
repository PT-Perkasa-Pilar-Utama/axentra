import { describe, expect, test } from "bun:test";
import { createLogger, type Logger } from "@axentra/observability";
import type { StorageAdapter } from "@axentra/storage";
import { DOWNLOAD_ACCESS_DENIED_MESSAGE, type AuthUser } from "@axentra/shared";
import { AppError, ForbiddenError, NotFoundError } from "../../http/errors";
import {
  executeDownloadOperation,
  type DownloadOperationDependencies,
} from "./download.operations";
import {
  InMemoryDownloadRepository,
  type DownloadTargetRecord,
  type IDownloadRepository,
} from "./download.repository";

const DOC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CATEGORY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STORAGE_KEY = `documents/${DOC_ID}/laporan.pdf`;

const memberUser: AuthUser = {
  id: "usr-member-1",
  email: "member@axentra.local",
  role: "member_team",
  name: "Member User",
};

const headUser: AuthUser = {
  id: "usr-head-1",
  email: "head@axentra.local",
  role: "head_of_team",
  name: "Head User",
};

const silentLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

function buildTarget(downloadEnabled: boolean): DownloadTargetRecord {
  return {
    document: {
      id: DOC_ID,
      title: "laporan.pdf",
      categoryId: CATEGORY_ID,
      processingStatus: "completed",
      deletedAt: null,
    },
    file: {
      id: "file-1",
      storageKey: STORAGE_KEY,
      originalName: "laporan.pdf",
      mimeType: "application/pdf",
      fileSize: 4,
      fileExtension: "pdf",
    },
    categoryPermission: { downloadEnabled },
  };
}

// The hook runs while storage is being prepared, which is between the pre-check and the audit commit.
function createStorage(beforeContent?: () => void): StorageAdapter {
  return {
    initialize: async () => {},
    checkHealth: async () => {},
    putObject: async () => {},
    getObject: async () => {
      beforeContent?.();
      return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    },
    deleteObject: async () => {},
    headObject: async (key) => ({
      key,
      contentLength: 4,
      contentType: "application/pdf",
      checksumSha256: undefined,
    }),
    createDownloadUrl: async (key) => {
      beforeContent?.();
      return `https://storage.test/${key}`;
    },
    close: async () => {},
  };
}

function buildDependencies(
  repository: IDownloadRepository,
  storage: StorageAdapter,
  logger: Logger = silentLogger,
): DownloadOperationDependencies {
  return { downloadRepository: repository, storage, logger };
}

async function captureError(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error: unknown) {
    return error;
  }
  throw new Error("expected the download operation to fail");
}

// The caller sees only the generic server error. The database error behind it carries the bound audit
// values (user, document, timestamp) in its params, and those values plus the raw message must not reach
// the response. The logs carry only the summary and the identifiers of the request, never the email.
function expectGenericAuditFailure(error: unknown): void {
  if (!(error instanceof AppError)) throw new Error("expected an AppError");
  expect(error.code).toBe("INTERNAL_ERROR");
  expect(error.status).toBe(500);
  expect(error.message).toBe("Terjadi kesalahan pada server");
  expect(error).not.toHaveProperty("params");
}

// Simulates the database error shape, where the bound audit values travel in params.
function auditInsertError(): Error {
  return Object.assign(new Error("insert failed"), {
    params: [memberUser.id, memberUser.email, DOC_ID],
  });
}

// Simulates a commit that fails after the audit insert, which must leave no audit row behind.
class AuditWriteFailingRepository extends InMemoryDownloadRepository {
  public constructor(private readonly createFailure: () => Error = auditInsertError) {
    super();
  }

  public override async transaction<T>(
    callback: (txRepo: IDownloadRepository) => Promise<T>,
  ): Promise<T> {
    return await super.transaction((txRepo) =>
      callback({
        ...txRepo,
        recordDownloadAuditEvent: async () => {
          throw this.createFailure();
        },
      }),
    );
  }
}

describe("Download audit write path (BE-S3-04 / AC-09.01)", () => {
  test("records who, which document, and when in one committed audit row", async () => {
    const repository = new InMemoryDownloadRepository();
    repository.setTarget(DOC_ID, buildTarget(true));
    const before = Date.now();

    await executeDownloadOperation(buildDependencies(repository, createStorage()), {
      documentId: DOC_ID,
      user: memberUser,
    });

    const events = repository.getRecordedAuditEvents();
    expect(events.length).toBe(1);
    expect(events[0]?.userId).toBe(memberUser.id);
    expect(events[0]?.userName).toBe("Member User");
    expect(events[0]?.userEmail).toBe(memberUser.email);
    expect(events[0]?.documentId).toBe(DOC_ID);
    expect(events[0]?.documentName).toBe("laporan.pdf");
    const downloadedAt = events[0]?.downloadedAt?.getTime() ?? 0;
    expect(downloadedAt).toBeGreaterThanOrEqual(before);
    expect(downloadedAt).toBeLessThanOrEqual(Date.now());
  });

  test("returns no signed URL when the audit insert fails (fail-closed)", async () => {
    const repository = new AuditWriteFailingRepository();
    repository.setTarget(DOC_ID, buildTarget(true));

    const error = await captureError(
      executeDownloadOperation(buildDependencies(repository, createStorage()), {
        documentId: DOC_ID,
        user: memberUser,
      }),
    );

    expectGenericAuditFailure(error);
    expect(repository.getRecordedAuditEvents().length).toBe(0);
  });

  test("returns no file bytes when the audit insert fails in stream mode", async () => {
    const repository = new AuditWriteFailingRepository();
    repository.setTarget(DOC_ID, buildTarget(true));

    const error = await captureError(
      executeDownloadOperation(buildDependencies(repository, createStorage()), {
        documentId: DOC_ID,
        user: memberUser,
        stream: true,
      }),
    );

    expectGenericAuditFailure(error);
    expect(repository.getRecordedAuditEvents().length).toBe(0);
  });

  test("logs only a summary of the audit failure, without the user email or the raw message", async () => {
    const logLines: string[] = [];
    const logger = createLogger({
      service: "axentra-api",
      environment: "test",
      version: "0.1.0",
      level: "error",
      destination: {
        write(line: string): void {
          logLines.push(line);
        },
      },
    });
    const repository = new AuditWriteFailingRepository();
    repository.setTarget(DOC_ID, buildTarget(true));

    const error = await captureError(
      executeDownloadOperation(buildDependencies(repository, createStorage(), logger), {
        documentId: DOC_ID,
        user: memberUser,
        requestId: "req-download-audit-1",
      }),
    );

    expectGenericAuditFailure(error);
    const logged = logLines.join("\n");
    expect(logged).toContain("Gagal mencatat audit event download");
    expect(logged).toContain("req-download-audit-1");
    expect(logged).not.toContain(memberUser.email);
    expect(logged).not.toContain("insert failed");
  });

  test("denies and writes no audit when permission is revoked before the audit commit", async () => {
    const repository = new InMemoryDownloadRepository();
    repository.setTarget(DOC_ID, buildTarget(true));
    const storage = createStorage(() => repository.setTarget(DOC_ID, buildTarget(false)));

    const attempt = executeDownloadOperation(buildDependencies(repository, storage), {
      documentId: DOC_ID,
      user: memberUser,
    });

    await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
    await expect(attempt).rejects.toThrow(DOWNLOAD_ACCESS_DENIED_MESSAGE);
    expect(repository.getRecordedAuditEvents().length).toBe(0);
  });

  test("denies and writes no audit when the document is deleted before the audit commit", async () => {
    const repository = new InMemoryDownloadRepository();
    repository.setTarget(DOC_ID, buildTarget(true));
    const storage = createStorage(() =>
      repository.setTarget(DOC_ID, {
        ...buildTarget(true),
        document: { ...buildTarget(true).document, deletedAt: new Date() },
      }),
    );

    const attempt = executeDownloadOperation(buildDependencies(repository, storage), {
      documentId: DOC_ID,
      user: memberUser,
    });

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError);
    await expect(attempt).rejects.toThrow("Dokumen tidak ditemukan");
    expect(repository.getRecordedAuditEvents().length).toBe(0);
  });

  test("denies and writes no audit when the document loses its category during storage I/O", async () => {
    const repository = new InMemoryDownloadRepository();
    repository.setTarget(DOC_ID, buildTarget(true));
    const storage = createStorage(() => {
      // Only the categoryId clause can deny here, because the permission row still says downloads are enabled.
      repository.checkCategoryPermissions = async (documentIds) =>
        documentIds.map((documentId) => ({
          documentId,
          categoryId: null,
          deletedAt: null,
          downloadEnabled: true,
        }));
    });

    const attempt = executeDownloadOperation(buildDependencies(repository, storage), {
      documentId: DOC_ID,
      user: memberUser,
    });

    await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.getRecordedAuditEvents().length).toBe(0);
  });

  test("reports not found and writes no audit when the document row is gone at recheck", async () => {
    const repository = new InMemoryDownloadRepository();
    repository.setTarget(DOC_ID, buildTarget(true));
    const storage = createStorage(() => {
      repository.checkCategoryPermissions = async () => [];
    });

    const attempt = executeDownloadOperation(buildDependencies(repository, storage), {
      documentId: DOC_ID,
      user: memberUser,
    });

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.getRecordedAuditEvents().length).toBe(0);
  });

  test("fails closed in stream mode when the stored object size differs from metadata", async () => {
    const repository = new InMemoryDownloadRepository();
    repository.setTarget(DOC_ID, buildTarget(true));
    let transactionCalls = 0;
    const openTransaction = repository.transaction.bind(repository);
    repository.transaction = (callback) => {
      transactionCalls += 1;
      return openTransaction(callback);
    };
    const shortObjectStorage: StorageAdapter = {
      ...createStorage(),
      getObject: async () => new Uint8Array([0x25, 0x50]),
    };

    const error = await captureError(
      executeDownloadOperation(buildDependencies(repository, shortObjectStorage), {
        documentId: DOC_ID,
        user: memberUser,
        stream: true,
      }),
    );

    expectGenericAuditFailure(error);
    // The size check runs before the audit unit of work, so no transaction is ever opened for it.
    expect(transactionCalls).toBe(0);
    expect(repository.getRecordedAuditEvents().length).toBe(0);
  });

  test("logs the Postgres SQLSTATE of a failed audit insert without the bound values", async () => {
    const logLines: string[] = [];
    const logger = createLogger({
      service: "axentra-api",
      environment: "test",
      version: "0.1.0",
      level: "error",
      destination: {
        write(line: string): void {
          logLines.push(line);
        },
      },
    });
    const repository = new AuditWriteFailingRepository(() =>
      Object.assign(new Error("insert failed"), {
        params: [memberUser.id, memberUser.email, DOC_ID],
        cause: Object.assign(new Error("violates foreign key"), { code: "23503" }),
      }),
    );
    repository.setTarget(DOC_ID, buildTarget(true));

    const error = await captureError(
      executeDownloadOperation(buildDependencies(repository, createStorage(), logger), {
        documentId: DOC_ID,
        user: memberUser,
      }),
    );

    expectGenericAuditFailure(error);
    const logged = logLines.join("\n");
    expect(logged).toContain("23503");
    expect(logged).not.toContain(memberUser.email);
    expect(logged).not.toContain("violates foreign key");
  });

  test("records the audit row for head_of_team even when category permission is disabled", async () => {
    const repository = new InMemoryDownloadRepository();
    repository.setTarget(DOC_ID, buildTarget(false));

    await executeDownloadOperation(buildDependencies(repository, createStorage()), {
      documentId: DOC_ID,
      user: headUser,
    });

    const events = repository.getRecordedAuditEvents();
    expect(events.length).toBe(1);
    expect(events[0]?.userId).toBe(headUser.id);
  });

  test("commits buffered audit rows when the unit of work succeeds", async () => {
    const repository = new InMemoryDownloadRepository();

    await repository.transaction(async (txRepo) => {
      await txRepo.recordDownloadAuditEvent({
        userId: memberUser.id,
        userEmail: memberUser.email,
        documentId: DOC_ID,
        documentName: "laporan.pdf",
      });
      expect(repository.getRecordedAuditEvents().length).toBe(0);
    });

    expect(repository.getRecordedAuditEvents().length).toBe(1);
  });

  test("discards pending audit rows when the unit of work fails", async () => {
    const repository = new InMemoryDownloadRepository();

    await expect(
      repository.transaction(async (txRepo) => {
        await txRepo.recordDownloadAuditEvent({
          userId: memberUser.id,
          userEmail: memberUser.email,
          documentId: DOC_ID,
          documentName: "laporan.pdf",
        });
        throw new Error("unit of work failed after recording");
      }),
    ).rejects.toThrow("unit of work failed after recording");
    expect(repository.getRecordedAuditEvents().length).toBe(0);
  });
});
