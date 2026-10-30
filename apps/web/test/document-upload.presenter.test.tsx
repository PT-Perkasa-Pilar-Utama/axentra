import { describe, expect, test, mock, afterEach } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

import { render, fireEvent, act, cleanup, screen } from "@testing-library/react";

// Bersihkan state komponen RTL setelah setiap tes
afterEach(() => {
  cleanup();
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

  test("FILES_SELECTED dengan batch campuran PDF + DOCX → status validation_error", () => {
    const state = from({
      type: "FILES_SELECTED",
      files: [
        pdf("a.pdf"),
        new File(["content"], "b.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ],
    });
    expect(state.status).toBe("validation_error");
    expect(state.notification?.message).toBe(UPLOAD_MESSAGES.MIXED_TYPES);
  });

  test("FILES_SELECTED dengan lebih dari 10 file DOCX → status validation_error", () => {
    const files = Array.from(
      { length: 11 },
      (_, index) =>
        new File(["content"], `doc-${index}.docx`, {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
    );
    const state = from({ type: "FILES_SELECTED", files });
    expect(state.status).toBe("validation_error");
    expect(state.notification?.message).toBe(UPLOAD_MESSAGES.EXCEEDS_BATCH_LIMIT);
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
  uploadFn?: ((files: File[]) => Promise<DocumentUploadAcceptedData>) | undefined;
}) {
  const client = new QueryClient();
  return (
    <QueryClientProvider client={client}>
      <InnerTest uploadFn={uploadFn} />
    </QueryClientProvider>
  );
}

function InnerTest({
  uploadFn,
}: {
  uploadFn?: ((files: File[]) => Promise<DocumentUploadAcceptedData>) | undefined;
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

  test("file JPG tidak didukung dan tidak memanggil upload", async () => {
    const uploadFn = mock(async () => makeAcceptedResult());
    render(<TestIntegration uploadFn={uploadFn} />);

    const fileInput = screen.getByTestId("upload-file-input");

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [jpg()] } });
    });

    expect(uploadFn).not.toHaveBeenCalled();
    expect(screen.getByTestId("upload-notification")).not.toBeNull();
    expect(screen.getByTestId("notification-message").textContent).toBe(
      UPLOAD_MESSAGES.UNSUPPORTED,
    );
    expect(screen.getByTestId("upload-empty-prompt")).not.toBeNull();
  });

  test("unggahan berhasil menampilkan pesan diterima dan kembali ke prompt setelah Unggah Dokumen Lain", async () => {
    const uploadFn = mock(async () => makeAcceptedResult());
    render(<TestIntegration uploadFn={uploadFn} />);

    const fileInput = screen.getByTestId("upload-file-input");

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [pdf()] } });
    });

    expect(screen.getByTestId("upload-processing-state")).not.toBeNull();
    expect(screen.getByTestId("notification-message").textContent).toBe(
      "File diterima untuk diproses",
    );

    const anotherButton = screen.getByTestId("upload-another-button");
    await act(async () => {
      fireEvent.click(anotherButton);
    });

    expect(screen.getByTestId("upload-empty-prompt")).not.toBeNull();
  });

  test("kegagalan upload menampilkan retry state, mempertahankan nama file, dan dapat di-retry langsung dari view", async () => {
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
      fireEvent.change(fileInput, { target: { files: [pdf("gagal.pdf")] } });
    });

    expect(uploadFn).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("upload-retry-state")).not.toBeNull();
    expect(screen.getByTestId("upload-retained-files").textContent).toContain("gagal.pdf");

    // 2. Klik tombol retry yang dirender di view
    const retryButton = screen.getByTestId("upload-retry-button");
    await act(async () => {
      fireEvent.click(retryButton);
    });

    expect(uploadFn).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("upload-processing-state")).not.toBeNull();
  });
});
