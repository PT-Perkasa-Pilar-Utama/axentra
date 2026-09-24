import { describe, expect, test } from "bun:test";
import type { DocumentUploadAcceptedData } from "@axentra/shared";
import { UPLOAD_MESSAGES } from "../src/features/document-upload/document-upload.rules";
import {
  applyUploadPresenterEvent,
  deriveUploadPresenterProps,
  initialUploadPresenterState,
  type UploadPresenterState,
} from "../src/features/document-upload/document-upload.presenter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pdf = (name = "dokumen.pdf") => new File(["content"], name, { type: "application/pdf" });

const jpg = (name = "gambar.jpg") => new File(["content"], name, { type: "image/jpeg" });

function makeAcceptedResult(
  overrides?: Partial<DocumentUploadAcceptedData>,
): DocumentUploadAcceptedData {
  return {
    message: "File diterima untuk diproses",
    count: 1,
    files: [{ filename: "dokumen.pdf", size: 7, documentType: "pdf" }],
    ...overrides,
  };
}

/** Jalankan satu event dari state awal atau state yang diberikan. */
function from(
  event: Parameters<typeof applyUploadPresenterEvent>[1],
  base?: UploadPresenterState,
): UploadPresenterState {
  return applyUploadPresenterEvent(base ?? initialUploadPresenterState(), event);
}

// ---------------------------------------------------------------------------
// F2 — Processing state transition
// ---------------------------------------------------------------------------

describe("applyUploadPresenterEvent — F2 processing state", () => {
  // ------------------------------------------------------------------ idle
  test("state awal adalah idle tanpa notification", () => {
    const state = initialUploadPresenterState();
    expect(state.status).toBe("idle");
    expect(state.notification).toBeNull();
    expect(state.pendingFiles).toHaveLength(0);
  });

  // ------------------------------------------------- FILES_SELECTED → uploading
  test("FILES_SELECTED dengan file valid → status uploading, notification dikosongkan", () => {
    const state = from({ type: "FILES_SELECTED", files: [pdf()] });
    expect(state.status).toBe("uploading");
    expect(state.notification).toBeNull();
    expect(state.pendingFiles).toHaveLength(1);
  });

  test("FILES_SELECTED dengan file tidak didukung → status unsupported_error, notification error", () => {
    const state = from({ type: "FILES_SELECTED", files: [jpg()] });
    expect(state.status).toBe("unsupported_error");
    expect(state.notification?.type).toBe("error");
    expect(state.notification?.message).toBe(UPLOAD_MESSAGES.UNSUPPORTED);
  });

  // ----------------------------------------------- UPLOAD_SUCCEEDED → processing
  test("UPLOAD_SUCCEEDED → status processing, bukan success", () => {
    const uploading = from({ type: "FILES_SELECTED", files: [pdf()] });
    const state = from({ type: "UPLOAD_SUCCEEDED", result: makeAcceptedResult() }, uploading);
    expect(state.status).toBe("processing");
  });

  test("UPLOAD_SUCCEEDED → notification sukses dengan pesan dari server", () => {
    const uploading = from({ type: "FILES_SELECTED", files: [pdf()] });
    const result = makeAcceptedResult({ message: "File diterima untuk diproses" });
    const state = from({ type: "UPLOAD_SUCCEEDED", result }, uploading);
    expect(state.notification?.type).toBe("success");
    expect(state.notification?.message).toBe("File diterima untuk diproses");
  });

  test("UPLOAD_SUCCEEDED — uploadedResult disimpan di state", () => {
    const uploading = from({ type: "FILES_SELECTED", files: [pdf()] });
    const result = makeAcceptedResult();
    const state = from({ type: "UPLOAD_SUCCEEDED", result }, uploading);
    expect(state.uploadedResult).toEqual(result);
  });

  // -------------------------------------------- UPLOAD_ANOTHER → idle (reset penuh)
  test("UPLOAD_ANOTHER dari processing → status kembali idle", () => {
    const uploading = from({ type: "FILES_SELECTED", files: [pdf()] });
    const processing = from({ type: "UPLOAD_SUCCEEDED", result: makeAcceptedResult() }, uploading);
    const state = from({ type: "UPLOAD_ANOTHER" }, processing);
    expect(state.status).toBe("idle");
  });

  test("UPLOAD_ANOTHER mereset notification, uploadedResult, dan pendingFiles", () => {
    const uploading = from({ type: "FILES_SELECTED", files: [pdf()] });
    const processing = from({ type: "UPLOAD_SUCCEEDED", result: makeAcceptedResult() }, uploading);
    const state = from({ type: "UPLOAD_ANOTHER" }, processing);
    expect(state.notification).toBeNull();
    expect(state.uploadedResult).toBeNull();
    expect(state.pendingFiles).toHaveLength(0);
  });

  // ----------------------------------------------- deriveUploadPresenterProps
  test("isBusy dan isLocked true hanya saat uploading, bukan saat processing", () => {
    const uploading = from({ type: "FILES_SELECTED", files: [pdf()] });
    const processing = from({ type: "UPLOAD_SUCCEEDED", result: makeAcceptedResult() }, uploading);

    const duringUpload = deriveUploadPresenterProps(uploading);
    const duringProcessing = deriveUploadPresenterProps(processing);

    expect(duringUpload.isBusy).toBe(true);
    expect(duringUpload.isLocked).toBe(true);
    expect(duringProcessing.isBusy).toBe(false);
    expect(duringProcessing.isLocked).toBe(false);
  });

  test("isProcessing true hanya saat processing", () => {
    const uploading = from({ type: "FILES_SELECTED", files: [pdf()] });
    const processing = from({ type: "UPLOAD_SUCCEEDED", result: makeAcceptedResult() }, uploading);

    expect(deriveUploadPresenterProps(uploading).isProcessing).toBe(false);
    expect(deriveUploadPresenterProps(processing).isProcessing).toBe(true);
  });

  test("canRetry false saat processing (status bukan error)", () => {
    const uploading = from({ type: "FILES_SELECTED", files: [pdf()] });
    const processing = from({ type: "UPLOAD_SUCCEEDED", result: makeAcceptedResult() }, uploading);
    expect(deriveUploadPresenterProps(processing).canRetry).toBe(false);
  });

  // --------------------------------------------- UPLOAD_FAILED → recoverable
  test("UPLOAD_FAILED dengan error generik → status error, canRetry true", () => {
    const uploading = from({ type: "FILES_SELECTED", files: [pdf()] });
    const failed = from({ type: "UPLOAD_FAILED", error: new Error("network") }, uploading);
    const derived = deriveUploadPresenterProps(failed);
    expect(failed.status).toBe("error");
    expect(derived.canRetry).toBe(true);
  });

  // --------------------------------------------- DISMISS_NOTIFICATION
  test("DISMISS_NOTIFICATION mengosongkan notification tanpa mengubah status", () => {
    const uploading = from({ type: "FILES_SELECTED", files: [pdf()] });
    const processing = from({ type: "UPLOAD_SUCCEEDED", result: makeAcceptedResult() }, uploading);
    const state = from({ type: "DISMISS_NOTIFICATION" }, processing);
    expect(state.notification).toBeNull();
    expect(state.status).toBe("processing");
  });
});
