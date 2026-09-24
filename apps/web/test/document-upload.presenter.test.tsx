import { GlobalRegistrator } from "@happy-dom/global-registrator";
// Registrasi DOM harus berjalan paling pertama sebelum file RTL dieksekusi
GlobalRegistrator.register();

// Memaksa Bun mengenali 'document' di scope global
globalThis.document = window.document;
global.document = window.document;

import { describe, expect, test, mock, afterEach, afterAll } from "bun:test";
import React from "react";
import type { DocumentUploadAcceptedData } from "@axentra/shared";
import { UPLOAD_MESSAGES } from "../src/features/document-upload/document-upload.rules";
import { useDocumentUploadPresenter } from "../src/features/document-upload/document-upload.presenter";
import { DocumentUploadAreaView } from "../src/features/document-upload/document-upload.view";
import {
  applyUploadPresenterEvent,
  deriveUploadPresenterProps,
  initialUploadPresenterState,
  type UploadPresenterState,
} from "../src/features/document-upload/document-upload.state";

// 1. Kita ambil tipenya saja agar lolos linter (tanpa memicu hoisting eksekusi)
import type * as TestingLibraryReact from "@testing-library/react";

// 2. Kita gunakan require untuk memaksa RTL dieksekusi SETELAH DOM siap,
// lalu di-cast as typeof agar tidak dianggap 'any' oleh oxlint.
const rtl = require("@testing-library/react") as typeof TestingLibraryReact;
const { render, fireEvent, act, cleanup, screen } = rtl;

// Bersihkan state komponen RTL setelah setiap tes
afterEach(() => {
  cleanup();
});

// PENTING: Copot Happy DOM setelah semua tes frontend selesai,
// agar object global seperti FormData tidak tumpang tindih dan merusak tes Backend!
afterAll(() => {
  GlobalRegistrator.unregister();
});

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

function from(
  event: Parameters<typeof applyUploadPresenterEvent>[1],
  base?: UploadPresenterState,
): UploadPresenterState {
  return applyUploadPresenterEvent(base ?? initialUploadPresenterState(), event);
}

// ---------------------------------------------------------------------------
// F2 & F13 — Pure State Machine Tests
// ---------------------------------------------------------------------------

describe("applyUploadPresenterEvent — pure state transitions", () => {
  test("state awal adalah idle tanpa notification", () => {
    const state = initialUploadPresenterState();
    expect(state.status).toBe("idle");
    expect(state.notification).toBeNull();
    expect(state.pendingFiles).toHaveLength(0);
  });

  test("FILES_SELECTED dengan file valid → status uploading", () => {
    const state = from({ type: "FILES_SELECTED", files: [pdf()] });
    expect(state.status).toBe("uploading");
    expect(state.notification).toBeNull();
    expect(state.pendingFiles).toHaveLength(1);
  });

  test("FILES_SELECTED dengan file tidak didukung → status unsupported_error", () => {
    const state = from({ type: "FILES_SELECTED", files: [jpg()] });
    expect(state.status).toBe("unsupported_error");
    expect(state.notification?.type).toBe("error");
    expect(state.notification?.message).toBe(UPLOAD_MESSAGES.UNSUPPORTED);
  });

  test("UPLOAD_SUCCEEDED → status processing, bukan success", () => {
    const uploading = from({ type: "FILES_SELECTED", files: [pdf()] });
    const state = from({ type: "UPLOAD_SUCCEEDED", result: makeAcceptedResult() }, uploading);
    expect(state.status).toBe("processing");
  });

  test("UPLOAD_ANOTHER dari processing → status kembali idle", () => {
    const uploading = from({ type: "FILES_SELECTED", files: [pdf()] });
    const processing = from({ type: "UPLOAD_SUCCEEDED", result: makeAcceptedResult() }, uploading);
    const state = from({ type: "UPLOAD_ANOTHER" }, processing);
    expect(state.status).toBe("idle");
  });

  test("UPLOAD_FAILED dengan error generik → status error, canRetry true", () => {
    const uploading = from({ type: "FILES_SELECTED", files: [pdf()] });
    const failed = from({ type: "UPLOAD_FAILED", error: new Error("network") }, uploading);
    const derived = deriveUploadPresenterProps(failed);
    expect(failed.status).toBe("error");
    expect(derived.canRetry).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F9 — Presenter Hook & View Integration Tests
// ---------------------------------------------------------------------------

function TestIntegration({
  uploadFn,
}: {
  uploadFn?: (files: File[]) => Promise<DocumentUploadAcceptedData>;
}) {
  const options = uploadFn ? { uploadFn } : undefined;
  const presenter = useDocumentUploadPresenter(options);
  return <DocumentUploadAreaView presenter={presenter} />;
}

describe("DocumentUpload Presenter & View Integration (F9)", () => {
  test("render awal menampilkan state idle (empty prompt)", () => {
    render(<TestIntegration />);
    expect(screen.getByTestId("upload-empty-prompt")).not.toBeNull();
  });

  test("memilih file valid akan memanggil hook dan mengubah UI ke state processing", async () => {
    const uploadFn = mock(async () => makeAcceptedResult());
    render(<TestIntegration uploadFn={uploadFn} />);

    const fileInput = screen.getByTestId("upload-file-input");

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [pdf()] } });
    });

    expect(uploadFn).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("upload-processing-state")).not.toBeNull();
  });

  test("kegagalan upload menampilkan retry state dan dapat di-retry langsung dari view", async () => {
    let callCount = 0;
    const uploadFn = mock(async () => {
      callCount++;
      if (callCount === 1) throw new Error("network_error");
      return makeAcceptedResult();
    });

    render(<TestIntegration uploadFn={uploadFn} />);

    const fileInput = screen.getByTestId("upload-file-input");

    // 1. Upload pertama disimulasikan gagal
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [pdf()] } });
    });

    expect(uploadFn).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("upload-retry-state")).not.toBeNull();

    // 2. Klik tombol retry yang dirender di view
    const retryButton = screen.getByTestId("upload-retry-button");
    await act(async () => {
      fireEvent.click(retryButton);
    });

    expect(uploadFn).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("upload-processing-state")).not.toBeNull();
  });
});
