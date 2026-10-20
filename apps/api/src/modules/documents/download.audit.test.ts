import { describe, expect, test } from "bun:test";
import { createLogger } from "@axentra/observability";
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
  type DownloadWriteScope,
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

const testLogger = createLogger({
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
  repository: InMemoryDownloadRepository,
  storage: StorageAdapter,
): DownloadOperationDependencies {
  return { downloadRepository: repository, storage, logger: testLogger };
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
// values (user, document, timestamp) in its params, and none of that may reach the response or the logs.
function expectGenericAuditFailure(error: unknown): void {
  if (!(error instanceof AppError)) throw new Error("expected an AppError");
  expect(error.code).toBe("INTERNAL_ERROR");
  expect(error.status).toBe(500);
  expect(error.message).toBe("Terjadi kesalahan pada server");
  expect(error).not.toHaveProperty("params");
}

// Simulates a commit that fails after the audit insert, which must leave no audit row behind.
class AuditWriteFailingRepository extends InMemoryDownloadRepository {
  public override async runInDownloadTransaction<T>(
    work: (scope: DownloadWriteScope) => Promise<T>,
  ): Promise<T> {
    return await super.runInDownloadTransaction((scope) =>
      work({
        lockDownloadTarget: scope.lockDownloadTarget,
        recordDownloadAuditEvent: async () => {
          throw new Error("audit insert failed");
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

  test("discards pending audit rows when the unit of work fails", async () => {
    const repository = new InMemoryDownloadRepository();

    await expect(
      repository.runInDownloadTransaction(async (scope) => {
        await scope.recordDownloadAuditEvent({
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
