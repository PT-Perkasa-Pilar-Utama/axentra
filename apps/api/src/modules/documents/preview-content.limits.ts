import { MAX_DOCUMENT_FILE_SIZE_BYTES } from "@axentra/shared";
import { RequestSemaphore } from "../../http/request-semaphore";

// Largest stored file the preview route reads into memory. It reuses the 50 MiB upload bound, so any
// file the upload accepted can be previewed; a larger stored size is refused before storage is read.
export const PREVIEW_MAX_FILE_BYTES = MAX_DOCUMENT_FILE_SIZE_BYTES;
// Per-process bound on preview storage reads in flight, separate from the bulk download budget.
// With PREVIEW_MAX_FILE_BYTES this caps read buffers at 4 x 50 MiB per API instance.
export const PREVIEW_CONTENT_MAX_CONCURRENCY = 4;
export const PREVIEW_CONTENT_MAX_QUEUE_LENGTH = 16;
export const PREVIEW_CONTENT_QUEUE_TIMEOUT_MS = 10_000;

const BYTES_PER_MEBIBYTE = 1024 * 1024;

export const PREVIEW_TOO_LARGE_MESSAGE = `Ukuran berkas melebihi batas pratinjau (${PREVIEW_MAX_FILE_BYTES / BYTES_PER_MEBIBYTE} MB)`;
export const PREVIEW_CONTENT_BUSY_MESSAGE =
  "Terlalu banyak permintaan pratinjau secara bersamaan, silakan coba beberapa saat lagi";

export function createPreviewContentSemaphore(): RequestSemaphore {
  return new RequestSemaphore({
    maxConcurrency: PREVIEW_CONTENT_MAX_CONCURRENCY,
    maxQueueLength: PREVIEW_CONTENT_MAX_QUEUE_LENGTH,
    queueTimeoutMs: PREVIEW_CONTENT_QUEUE_TIMEOUT_MS,
    messages: {
      queueFull: PREVIEW_CONTENT_BUSY_MESSAGE,
      queueTimeout:
        "Batas waktu tunggu antrean pratinjau terlampaui, silakan coba beberapa saat lagi",
      aborted: "Permintaan pratinjau dibatalkan oleh klien",
    },
  });
}

// Default process-wide limiter for preview content reads, applied per API instance.
export const globalPreviewContentSemaphore = createPreviewContentSemaphore();
