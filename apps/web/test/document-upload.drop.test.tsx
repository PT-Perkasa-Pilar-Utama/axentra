import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DocumentUploadAcceptedData } from "@axentra/shared";
import { UPLOAD_MESSAGES } from "../src/features/document-upload/document-upload.rules";
import { useDocumentUploadPresenter } from "../src/features/document-upload/document-upload.presenter";
import { DocumentUploadAreaView } from "../src/features/document-upload/document-upload.view";
import {
  setAuthTokenGetter,
  setSessionRefresher,
  setUnauthorizedHandler,
} from "../src/lib/api-client";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const pdf = (name = "laporan.pdf") => new File(["pdf-bytes"], name, { type: "application/pdf" });
const docx = (name: string) => new File(["docx-bytes"], name, { type: DOCX_MIME });
const jpg = (name = "foto.jpg") => new File(["jpg-bytes"], name, { type: "image/jpeg" });

function createMockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit | undefined) => Promise<Response>,
) {
  return Object.assign(handler, {
    preconnect: (
      _url: string | URL,
      _options?: { dns?: boolean; tcp?: boolean; http?: boolean; https?: boolean } | undefined,
    ): void => {},
  });
}

function acceptedResponse(names: string[], documentType: "pdf" | "docx"): Response {
  const data: DocumentUploadAcceptedData = {
    message: "File diterima untuk diproses",
    count: names.length,
    files: names.map((filename) => ({ filename, size: 10, documentType })),
  };
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function UploadHarness() {
  const presenter = useDocumentUploadPresenter();
  return <DocumentUploadAreaView presenter={presenter} />;
}

function renderUploadArea(): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <UploadHarness />
    </QueryClientProvider>,
  );
}

function dropFiles(files: File[]): void {
  fireEvent.drop(screen.getByTestId("upload-dropzone"), { dataTransfer: { files } });
}

function requestFileNames(init: RequestInit | undefined): string[] {
  const body = init?.body;
  if (!(body instanceof FormData)) throw new Error("Expected a FormData request body");
  return body.getAll("files").map((entry) => (entry instanceof File ? entry.name : String(entry)));
}

afterEach(() => {
  cleanup();
  setAuthTokenGetter(null);
  setUnauthorizedHandler(null);
  setSessionRefresher(null);
});

describe("drop ke area unggah: request body dan notifikasi (AC-01.01, AC-01.04)", () => {
  test("drop tiga file DOCX: request berisi ketiga file dan satu notifikasi mencantumkan setiap nama", async () => {
    const names = ["a.docx", "b.docx", "c.docx"];
    let capturedInit: RequestInit | undefined;
    let capturedUrl = "";
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async (input, init) => {
        capturedUrl = String(input);
        capturedInit = init;
        return acceptedResponse(names, "docx");
      }),
    );
    try {
      renderUploadArea();
      dropFiles(names.map((name) => docx(name)));

      await waitFor(() => expect(screen.getByTestId("upload-notification")).toBeTruthy());

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(capturedUrl).toContain("/documents/upload");
      expect(capturedInit?.credentials).toBe("include");
      expect(requestFileNames(capturedInit)).toEqual(names);

      expect(screen.getByTestId("upload-notification").textContent).toBe(
        "File diterima untuk diproses: a.docx, b.docx, c.docx",
      );
      expect(screen.queryByTestId("notification-file-list")).toBeNull();
      expect(screen.getByTestId("upload-processing-state")).toBeTruthy();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("drop satu file PDF: request berisi satu file dan notifikasi tepat 'File diterima untuk diproses'", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async (_input, init) => {
        capturedInit = init;
        return acceptedResponse(["laporan.pdf"], "pdf");
      }),
    );
    try {
      renderUploadArea();
      dropFiles([pdf()]);

      await waitFor(() => expect(screen.getByTestId("upload-notification")).toBeTruthy());

      expect(requestFileNames(capturedInit)).toEqual(["laporan.pdf"]);
      expect(screen.getByTestId("upload-notification").textContent).toBe(
        "File diterima untuk diproses",
      );
      expect(screen.queryByTestId("notification-file-list")).toBeNull();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("drop campuran satu PDF dan tiga DOCX ditolak di sisi klien tanpa request", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () => acceptedResponse(["a.docx"], "docx")),
    );
    try {
      renderUploadArea();
      dropFiles([pdf(), docx("a.docx"), docx("b.docx"), docx("c.docx")]);

      await waitFor(() => expect(screen.getByTestId("upload-notification")).toBeTruthy());

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(screen.getByTestId("notification-message").textContent).toBe(
        UPLOAD_MESSAGES.MIXED_TYPES,
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("pesan error unggahan (AC-01.03, AC-02.01)", () => {
  test("drop JPG menampilkan 'Tipe file tidak didukung' dan tidak mengirim request", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () => acceptedResponse(["foto.jpg"], "pdf")),
    );
    try {
      renderUploadArea();
      dropFiles([jpg()]);

      await waitFor(() => expect(screen.getByTestId("upload-notification")).toBeTruthy());

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(screen.getByTestId("upload-notification").textContent).toBe(
        "Tipe file tidak didukung",
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("respons 409 menampilkan 'File ini sudah ada' dan tidak menawarkan ulang", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () =>
        errorResponse(409, "DUPLICATE_DOCUMENT", "Dokumen dengan konten yang sama sudah tersimpan"),
      ),
    );
    try {
      renderUploadArea();
      dropFiles([pdf("laporan-keuangan.pdf")]);

      await waitFor(() => expect(screen.getByTestId("upload-notification")).toBeTruthy());

      expect(screen.getByTestId("upload-notification").textContent).toBe("File ini sudah ada");
      expect(screen.getByTestId("upload-empty-prompt")).toBeTruthy();
      expect(screen.queryByTestId("upload-retry-button")).toBeNull();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("respons 415 dari server juga menampilkan 'Tipe file tidak didukung'", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () =>
        errorResponse(415, "UNSUPPORTED_FILE_TYPE", "Format berkas tidak dikenali"),
      ),
    );
    try {
      renderUploadArea();
      dropFiles([pdf()]);

      await waitFor(() => expect(screen.getByTestId("upload-notification")).toBeTruthy());

      expect(screen.getByTestId("upload-notification").textContent).toBe(
        "Tipe file tidak didukung",
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
