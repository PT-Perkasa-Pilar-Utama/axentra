import { describe, expect, test } from "bun:test";
import { createLogger, type Logger } from "@axentra/observability";
import type { StorageAdapter } from "@axentra/storage";
import type { AuthUser } from "@axentra/shared";
import { AppError, ForbiddenError, NotFoundError } from "../../http/errors";
import {
  executeBulkDownloadOperation,
  type BulkDownloadOperationDependencies,
  type ExecuteBulkDownloadInput,
} from "./bulk-download.operations";
import {
  InMemoryDownloadRepository,
  type DownloadTargetRecord,
  type IDownloadRepository,
} from "./download.repository";

const CATEGORY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FIRST_DOC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECOND_DOC_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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

const bulkInput: ExecuteBulkDownloadInput = {
  documentIds: [FIRST_DOC_ID, SECOND_DOC_ID],
  user: memberUser,
};

function buildTarget(documentId: string, downloadEnabled: boolean): DownloadTargetRecord {
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
      originalName: "laporan.pdf",
      mimeType: "application/pdf",
      fileSize: 4,
      fileExtension: "pdf",
    },
    categoryPermission: { downloadEnabled },
  };
}

// The hook runs during the storage prefetch, which is before the audit unit of work starts.
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
    createDownloadUrl: async (key) => `https://storage.test/${key}`,
    close: async () => {},
  };
}

function buildDependencies(
  repository: IDownloadRepository,
  storage: StorageAdapter,
  logger: Logger = silentLogger,
): BulkDownloadOperationDependencies {
  return { downloadRepository: repository, storage, logger };
}

async function captureError(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error: unknown) {
    return error;
  }
  throw new Error("expected the bulk download operation to fail");
}

// Simulates the database error shape, where the bound audit values travel in params.
function auditInsertError(): Error {
  return Object.assign(new Error("insert failed"), {
    params: [memberUser.id, memberUser.email, FIRST_DOC_ID],
  });
}

// Fails the bulk audit insert after the authorization recheck, so the whole unit of work must roll back.
class BulkAuditWriteFailingRepository extends InMemoryDownloadRepository {
  public override async transaction<T>(
    callback: (txRepo: IDownloadRepository) => Promise<T>,
  ): Promise<T> {
    return await super.transaction((txRepo) =>
      callback({
        ...txRepo,
        recordDownloadAuditEvents: async () => {
          throw auditInsertError();
        },
      }),
    );
  }
}

function seedRepository(repository: InMemoryDownloadRepository, downloadEnabled: boolean): void {
  repository.setTarget(FIRST_DOC_ID, buildTarget(FIRST_DOC_ID, downloadEnabled));
  repository.setTarget(SECOND_DOC_ID, buildTarget(SECOND_DOC_ID, downloadEnabled));
}

function softDeleteFirstDocument(repository: InMemoryDownloadRepository): void {
  const target = buildTarget(FIRST_DOC_ID, true);
  repository.setTarget(FIRST_DOC_ID, {
    ...target,
    document: { ...target.document, deletedAt: new Date() },
  });
}

describe("Bulk download audit write path (BE-S3-04 / AC-10.01)", () => {
  test("returns a generic server error and no archive when the bulk audit insert fails", async () => {
    const repository = new BulkAuditWriteFailingRepository();
    seedRepository(repository, true);

    const error = await captureError(
      executeBulkDownloadOperation(buildDependencies(repository, createStorage()), bulkInput),
    );

    if (!(error instanceof AppError)) throw new Error("expected an AppError");
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.status).toBe(500);
    expect(error.message).toBe("Terjadi kesalahan pada server");
    expect(error).not.toHaveProperty("params");
    expect(repository.getRecordedAuditEvents().length).toBe(0);
  });

  test("keeps the 403 and writes no audit when a permission is revoked before the bulk audit commit", async () => {
    const repository = new InMemoryDownloadRepository();
    seedRepository(repository, true);
    const storage = createStorage(() =>
      repository.setTarget(FIRST_DOC_ID, buildTarget(FIRST_DOC_ID, false)),
    );

    const error = await captureError(
      executeBulkDownloadOperation(buildDependencies(repository, storage), bulkInput),
    );

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(repository.getRecordedAuditEvents().length).toBe(0);
  });

  test("rejects with 404 and writes no audit when a document is soft-deleted during storage prefetch for member_team", async () => {
    const repository = new InMemoryDownloadRepository();
    seedRepository(repository, true);
    const storage = createStorage(() => softDeleteFirstDocument(repository));

    const error = await captureError(
      executeBulkDownloadOperation(buildDependencies(repository, storage), bulkInput),
    );

    expect(error).toBeInstanceOf(NotFoundError);
    expect(repository.getRecordedAuditEvents().length).toBe(0);
  });

  test("rejects with 404 and writes no audit when a document is soft-deleted during storage prefetch for head_of_team", async () => {
    const repository = new InMemoryDownloadRepository();
    seedRepository(repository, true);
    const storage = createStorage(() => softDeleteFirstDocument(repository));

    const error = await captureError(
      executeBulkDownloadOperation(buildDependencies(repository, storage), {
        ...bulkInput,
        user: headUser,
      }),
    );

    expect(error).toBeInstanceOf(NotFoundError);
    expect(repository.getRecordedAuditEvents().length).toBe(0);
  });

  test("rejects with 404 and writes no audit when a document status row is absent at the bulk recheck", async () => {
    const repository = new InMemoryDownloadRepository();
    seedRepository(repository, true);
    const storage = createStorage(() => {
      repository.checkCategoryPermissions = async () => [];
    });

    const error = await captureError(
      executeBulkDownloadOperation(buildDependencies(repository, storage), bulkInput),
    );

    expect(error).toBeInstanceOf(NotFoundError);
    expect(repository.getRecordedAuditEvents().length).toBe(0);
  });

  test("rejects with 403 and writes no audit when the permission row is missing for member_team at the bulk recheck", async () => {
    const repository = new InMemoryDownloadRepository();
    seedRepository(repository, true);
    const storage = createStorage(() => {
      // The status row is present, but downloads are not enabled, so the category clause must deny.
      repository.checkCategoryPermissions = async (documentIds) =>
        documentIds.map((documentId) => ({
          documentId,
          categoryId: CATEGORY_ID,
          deletedAt: null,
          downloadEnabled: null,
        }));
    });

    const error = await captureError(
      executeBulkDownloadOperation(buildDependencies(repository, storage), bulkInput),
    );

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(repository.getRecordedAuditEvents().length).toBe(0);
  });

  test("rejects with 403 and writes no audit when a document loses its category for member_team at the bulk recheck", async () => {
    const repository = new InMemoryDownloadRepository();
    seedRepository(repository, true);
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

    const error = await captureError(
      executeBulkDownloadOperation(buildDependencies(repository, storage), bulkInput),
    );

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(repository.getRecordedAuditEvents().length).toBe(0);
  });

  test("logs only a summary of the bulk audit failure, without the user email or the raw message", async () => {
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
    const repository = new BulkAuditWriteFailingRepository();
    seedRepository(repository, true);

    await captureError(
      executeBulkDownloadOperation(buildDependencies(repository, createStorage(), logger), {
        ...bulkInput,
        requestId: "req-bulk-audit-unit-1",
      }),
    );

    const logged = logLines.join("\n");
    expect(logged).toContain("Gagal mencatat audit event bulk download");
    expect(logged).toContain("req-bulk-audit-unit-1");
    expect(logged).not.toContain(memberUser.email);
    expect(logged).not.toContain("insert failed");
  });
});
