import { describe, expect, test } from "bun:test";
import { apiErrorSchema } from "@axentra/shared";
import { PayloadTooLargeError, TooManyRequestsError } from "../../http/errors";
import { RequestSemaphore } from "../../http/request-semaphore";
import { InMemoryPreviewRepository, type PreviewTargetRecord } from "./preview.repository";
import {
  PREVIEW_CONTENT_BUSY_MESSAGE,
  PREVIEW_MAX_FILE_BYTES,
  PREVIEW_TOO_LARGE_MESSAGE,
} from "./preview-content.limits";
import { executePreviewContentOperation } from "./preview-content.operations";
import { createMockStorage, createPreviewSetup, samplePdfBytes } from "./preview.test-support";

// F16: a stored size above the preview limit is refused before the storage object is read, and preview
// reads are bounded by a concurrency limit.

const OVERSIZED_DOC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OVERSIZED_STORAGE_KEY = "storage/oversized.pdf";

function pdfTarget(documentId: string, fileSize: number): PreviewTargetRecord {
  return {
    document: { id: documentId, deletedAt: null },
    file: {
      id: `file-${documentId}`,
      storageKey: OVERSIZED_STORAGE_KEY,
      originalName: "oversized.pdf",
      mimeType: "application/pdf",
      fileSize,
    },
  };
}

describe("preview content size limit before storage read (F16)", () => {
  test("refuses a stored file above the limit with 413 and never calls storage.getObject", async () => {
    let reads = 0;
    const { app, previewRepository } = createPreviewSetup(
      createMockStorage({
        getObject: async () => {
          reads++;
          return samplePdfBytes;
        },
      }),
    );
    previewRepository.setTarget(
      OVERSIZED_DOC_ID,
      pdfTarget(OVERSIZED_DOC_ID, PREVIEW_MAX_FILE_BYTES + 1),
    );

    const response = await app.request(`/api/v1/documents/${OVERSIZED_DOC_ID}/preview/content`, {
      headers: { authorization: "Bearer member-token" },
    });

    expect(response.status).toBe(413);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(body.error.message).toBe(PREVIEW_TOO_LARGE_MESSAGE);
    expect(reads).toBe(0);
  });

  test("the operation rejects an oversized file before any storage read", async () => {
    let reads = 0;
    const previewRepository = new InMemoryPreviewRepository();
    previewRepository.setTarget(
      OVERSIZED_DOC_ID,
      pdfTarget(OVERSIZED_DOC_ID, PREVIEW_MAX_FILE_BYTES + 1),
    );
    const storage = createMockStorage({
      getObject: async () => {
        reads++;
        return samplePdfBytes;
      },
    });

    await expect(
      executePreviewContentOperation(
        { previewRepository, storage },
        { documentId: OVERSIZED_DOC_ID },
      ),
    ).rejects.toThrow(PayloadTooLargeError);
    expect(reads).toBe(0);
  });

  test("a file at exactly the limit is not refused by the size check, so it is read", async () => {
    let reads = 0;
    const previewRepository = new InMemoryPreviewRepository();
    previewRepository.setTarget(
      OVERSIZED_DOC_ID,
      pdfTarget(OVERSIZED_DOC_ID, PREVIEW_MAX_FILE_BYTES),
    );
    const storage = createMockStorage({
      getObject: async () => {
        reads++;
        // Returns a short object on purpose: the size mismatch that follows the read is the expected failure.
        return samplePdfBytes;
      },
    });

    await expect(
      executePreviewContentOperation(
        { previewRepository, storage },
        { documentId: OVERSIZED_DOC_ID },
      ),
    ).rejects.toThrow();
    expect(reads).toBe(1);
  });

  test("a preview read waits for the concurrency slot and is refused when the queue is full", async () => {
    const previewRepository = new InMemoryPreviewRepository();
    previewRepository.setTarget(OVERSIZED_DOC_ID, pdfTarget(OVERSIZED_DOC_ID, 8));
    let reads = 0;
    const storage = createMockStorage({
      getObject: async () => {
        reads++;
        return samplePdfBytes;
      },
    });
    const previewContentSemaphore = new RequestSemaphore({
      maxConcurrency: 1,
      maxQueueLength: 0,
      queueTimeoutMs: 1_000,
      messages: {
        queueFull: PREVIEW_CONTENT_BUSY_MESSAGE,
        queueTimeout: "Batas waktu tunggu antrean pratinjau terlampaui",
        aborted: "Permintaan pratinjau dibatalkan oleh klien",
      },
    });
    const releaseHeld = await previewContentSemaphore.acquire();

    await expect(
      executePreviewContentOperation(
        { previewRepository, storage, previewContentSemaphore },
        { documentId: OVERSIZED_DOC_ID },
      ),
    ).rejects.toThrow(TooManyRequestsError);
    expect(reads).toBe(0);
    releaseHeld();
  });
});
