import { describe, expect, test } from "bun:test";
import { createLogger } from "@axentra/observability";
import type { StorageAdapter } from "@axentra/storage";
import type { IDocumentRepository } from "./documents.repository";
import { createDocumentService } from "./documents.service";
import { createInMemoryRepository, createInMemoryStorage } from "./documents.service.helpers";

const pdfBytes = new TextEncoder().encode("%PDF-1.4\n% rollback log\n");

describe("upload rollback logging (BE-S3-04 B5)", () => {
  test("logs a failed orphan cleanup without any storage object key", async () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: "axentra-api",
      environment: "test",
      version: "0.1.0",
      level: "error",
      destination: {
        write: (line: string) => {
          lines.push(line);
        },
      },
    });

    const storedKeys: string[] = [];
    const memoryStorage = createInMemoryStorage();
    const storage: StorageAdapter = {
      ...memoryStorage,
      putObject: async (input) => {
        storedKeys.push(input.key);
        await memoryStorage.putObject(input);
      },
      deleteObject: async () => {
        throw new Error("object store unavailable");
      },
    };
    const repository: IDocumentRepository = {
      ...createInMemoryRepository(),
      saveDocumentBatch: async () => {
        throw new Error("database unavailable");
      },
    };
    const service = createDocumentService({ repository, storage, logger });

    await expect(
      service.uploadDocuments([
        {
          filename: "laporan.pdf",
          mimeType: "application/pdf",
          size: pdfBytes.byteLength,
          bytes: pdfBytes,
        },
      ]),
    ).rejects.toThrow("database unavailable");

    const output = lines.join("\n");
    expect(storedKeys).toHaveLength(1);
    expect(output).toContain("Failed to clean up orphaned storage object during rollback");
    expect(output).toContain('"failedCount":1');
    for (const key of storedKeys) {
      expect(output).not.toContain(key);
    }
    expect(output).not.toContain("documents/");
  });
});
