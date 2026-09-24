import { describe, expect, test } from "bun:test";
import { ApiClientError } from "../src/lib/api-client";
import { DOCUMENT_ERROR_CODES } from "@axentra/shared";
import {
  classifyUploadError,
  isRecoverableStatus,
  isSupportedFile,
  UPLOAD_MESSAGES,
  validateUploadFiles,
} from "../src/features/document-upload/document-upload.rules";

const pdf = (name = "dokumen.pdf") => ({ name, type: "application/pdf" });
const docx = (name = "dokumen.docx") => ({
  name,
  type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
});
const jpg = (name = "gambar.jpg") => ({ name, type: "image/jpeg" });

describe("validateUploadFiles", () => {
  // AC-01.01: 1 file PDF diterima
  test("menerima 1 file PDF", () => {
    const result = validateUploadFiles([pdf()]);
    expect(result.valid).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  // AC-01.03: file .JPG ditolak dengan pesan "Tipe file tidak didukung"
  test("menolak file .JPG dengan pesan tipe tidak didukung", () => {
    const result = validateUploadFiles([jpg()]);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toBe(UPLOAD_MESSAGES.UNSUPPORTED);
  });

  // AC-01.04: 3 file DOCX sekaligus diterima
  test("menerima 3 file DOCX sekaligus", () => {
    const result = validateUploadFiles([docx("a.docx"), docx("b.docx"), docx("c.docx")]);
    expect(result.valid).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  test("menolak array file kosong", () => {
    const result = validateUploadFiles([]);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toBe(UPLOAD_MESSAGES.EMPTY_FILES);
  });

  test("menolak campuran PDF dan DOCX dalam satu batch", () => {
    const result = validateUploadFiles([pdf(), docx()]);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toBe(UPLOAD_MESSAGES.MIXED_TYPES);
  });

  test("menolak lebih dari 1 file PDF sekaligus", () => {
    const result = validateUploadFiles([pdf("a.pdf"), pdf("b.pdf")]);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toBe(UPLOAD_MESSAGES.SINGLE_PDF_ONLY);
  });
});

describe("isSupportedFile", () => {
  test("menerima ekstensi & mime type PDF", () => {
    expect(isSupportedFile(pdf())).toBe(true);
  });

  test("menerima ekstensi & mime type DOCX", () => {
    expect(isSupportedFile(docx())).toBe(true);
  });

  test("menolak ekstensi JPG", () => {
    expect(isSupportedFile(jpg())).toBe(false);
  });
});

describe("classifyUploadError", () => {
  // Semua error state: duplicate / unsupported / recoverable(generic)
  // 409 DUPLICATE_DOCUMENT, pesan "File ini sudah ada" (api-specs/03-documents.md)
  test("mengklasifikasikan error duplikat (409 DUPLICATE_DOCUMENT)", () => {
    const error = new ApiClientError(
      DOCUMENT_ERROR_CODES.DUPLICATE_DOCUMENT,
      UPLOAD_MESSAGES.DUPLICATE,
      409,
    );
    const result = classifyUploadError(error);
    expect(result.status).toBe("duplicate_error");
    expect(result.message).toBe(UPLOAD_MESSAGES.DUPLICATE);
  });

  test("mengklasifikasikan error duplikat lewat pesan 'already exists' (fallback)", () => {
    const error = new ApiClientError("OTHER", "Document already exists", 400);
    const result = classifyUploadError(error);
    expect(result.status).toBe("duplicate_error");
  });

  // 415 Unsupported Media Type, pesan "Tipe file tidak didukung" (api-specs/03-documents.md)
  test("mengklasifikasikan error tipe tidak didukung (415 UNSUPPORTED_FILE_TYPE)", () => {
    const error = new ApiClientError(
      DOCUMENT_ERROR_CODES.UNSUPPORTED_FILE_TYPE,
      UPLOAD_MESSAGES.UNSUPPORTED,
      415,
    );
    const result = classifyUploadError(error);
    expect(result.status).toBe("unsupported_error");
  });

  test("mengklasifikasikan error generik/transien sebagai recoverable", () => {
    const error = new Error("Network error");
    const result = classifyUploadError(error);
    expect(result.status).toBe("error");
    expect(result.message).toBe("Network error");
  });

  test("fallback ke pesan generik saat error tanpa message", () => {
    const result = classifyUploadError({});
    expect(result.status).toBe("error");
    expect(result.message).toBe(UPLOAD_MESSAGES.GENERIC_ERROR);
  });
});

describe("isRecoverableStatus", () => {
  test("hanya status 'error' yang recoverable", () => {
    expect(isRecoverableStatus("error")).toBe(true);
    expect(isRecoverableStatus("duplicate_error")).toBe(false);
    expect(isRecoverableStatus("unsupported_error")).toBe(false);
    expect(isRecoverableStatus("processing")).toBe(false);
  });
});
