import { createLogger } from "@axentra/observability";
import type { StorageAdapter } from "@axentra/storage";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { createDocumentService } from "./documents.service";
import { InMemoryPreviewRepository, type PreviewTargetRecord } from "./preview.repository";

export const PDF_DOC_ID = "11111111-1111-4111-8111-111111111111";
export const DOCX_DOC_ID = "22222222-2222-4222-8222-222222222222";
export const NO_FILE_DOC_ID = "33333333-3333-4333-8333-333333333333";
export const DELETED_DOC_ID = "44444444-4444-4444-8444-444444444444";
export const MISMATCH_DOC_ID = "55555555-5555-4555-8555-555555555555";
export const UNSUPPORTED_DOC_ID = "66666666-6666-4666-8666-666666666666";
export const UNICODE_DOC_ID = "77777777-7777-4777-8777-777777777777";
export const MISSING_DOC_ID = "99999999-9999-4999-8999-999999999999";

export const PDF_STORAGE_KEY = "storage/laporan.pdf";
export const DOCX_STORAGE_KEY = "storage/kontrak.docx";
export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

export const tokenVerifier: TokenVerifier = {
  verifyToken(token: string) {
    if (token === "member-token") {
      return {
        id: "usr-member-1",
        email: "member@axentra.local",
        role: "member_team",
        name: "Member User",
      };
    }
    if (token === "head-token") {
      return {
        id: "usr-head-1",
        email: "head@axentra.local",
        role: "head_of_team",
        name: "Head User",
      };
    }
    if (token === "admin-token") {
      return {
        id: "usr-admin-1",
        email: "admin@axentra.local",
        role: "admin",
        name: "Admin User",
      };
    }
    return null;
  },
};

export const samplePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
export const sampleDocxBytes = new Uint8Array(4096).fill(0x50);

export function createMockStorage(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  const objects = new Map<string, Uint8Array>([
    [PDF_STORAGE_KEY, samplePdfBytes],
    [DOCX_STORAGE_KEY, sampleDocxBytes],
  ]);
  return {
    initialize: async () => {},
    checkHealth: async () => {},
    putObject: async () => {},
    getObject: async (key: string) => {
      const bytes = objects.get(key);
      if (!bytes) throw new Error(`Object not found: ${key}`);
      return bytes;
    },
    deleteObject: async () => {},
    headObject: async (key: string) => ({
      key,
      contentLength: objects.get(key)?.byteLength ?? 0,
      contentType: "application/pdf",
      checksumSha256: undefined,
    }),
    createDownloadUrl: async (key: string, expiresInSeconds = 300) =>
      `https://mock-storage.local/${key}?expires=${expiresInSeconds}&sig=test`,
    close: async () => {},
    ...overrides,
  };
}

function setTargets(previewRepository: InMemoryPreviewRepository): void {
  const targets: ReadonlyArray<readonly [string, PreviewTargetRecord]> = [
    [
      PDF_DOC_ID,
      {
        document: { id: PDF_DOC_ID, deletedAt: null },
        file: {
          id: "file-1",
          storageKey: PDF_STORAGE_KEY,
          originalName: "laporan.pdf",
          mimeType: "application/pdf",
          fileSize: samplePdfBytes.byteLength,
        },
      },
    ],
    [
      DOCX_DOC_ID,
      {
        document: { id: DOCX_DOC_ID, deletedAt: null },
        file: {
          id: "file-2",
          storageKey: DOCX_STORAGE_KEY,
          originalName: "kontrak.docx",
          mimeType: DOCX_MIME_TYPE,
          fileSize: sampleDocxBytes.byteLength,
        },
      },
    ],
    [NO_FILE_DOC_ID, { document: { id: NO_FILE_DOC_ID, deletedAt: null }, file: null }],
    [
      DELETED_DOC_ID,
      {
        document: { id: DELETED_DOC_ID, deletedAt: new Date("2026-10-01T00:00:00.000Z") },
        file: {
          id: "file-4",
          storageKey: PDF_STORAGE_KEY,
          originalName: "deleted.pdf",
          mimeType: "application/pdf",
          fileSize: samplePdfBytes.byteLength,
        },
      },
    ],
    [
      MISMATCH_DOC_ID,
      {
        document: { id: MISMATCH_DOC_ID, deletedAt: null },
        file: {
          id: "file-5",
          storageKey: PDF_STORAGE_KEY,
          originalName: "rusak.pdf",
          mimeType: "application/pdf",
          fileSize: samplePdfBytes.byteLength + 100,
        },
      },
    ],
    [
      UNSUPPORTED_DOC_ID,
      {
        document: { id: UNSUPPORTED_DOC_ID, deletedAt: null },
        file: {
          id: "file-6",
          storageKey: PDF_STORAGE_KEY,
          originalName: "catatan.txt",
          mimeType: "text/plain",
          fileSize: samplePdfBytes.byteLength,
        },
      },
    ],
    [
      UNICODE_DOC_ID,
      {
        document: { id: UNICODE_DOC_ID, deletedAt: null },
        file: {
          id: "file-7",
          storageKey: PDF_STORAGE_KEY,
          originalName: "Laporan Keuangan (Final) é.pdf",
          mimeType: "application/pdf",
          fileSize: samplePdfBytes.byteLength,
        },
      },
    ],
  ];
  for (const [documentId, record] of targets) {
    previewRepository.setTarget(documentId, record);
  }
}

export function createPreviewSetup(storage: StorageAdapter = createMockStorage()): {
  app: ReturnType<typeof createApp>;
  previewRepository: InMemoryPreviewRepository;
  storage: StorageAdapter;
} {
  const previewRepository = new InMemoryPreviewRepository();
  setTargets(previewRepository);

  const documentService = createDocumentService({
    previewRepository,
    storage,
    logger: testLogger,
  });

  const app = createApp({
    logger: testLogger,
    version: "0.1.0",
    readinessChecks: [],
    tokenVerifier,
    documentService,
  });

  return { app, previewRepository, storage };
}
