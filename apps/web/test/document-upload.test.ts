import { describe, expect, test } from "bun:test";
import {
  isSupportedFile,
  validateUploadFiles,
  UPLOAD_MESSAGES,
} from "../src/features/document-upload/document-upload.presenter";

describe("document-upload validation and messages", () => {
  test("AC-01.01: accepts single valid PDF file", () => {
    const pdfFile = { name: "laporan.pdf", type: "application/pdf" };
    expect(isSupportedFile(pdfFile)).toBe(true);

    const result = validateUploadFiles([pdfFile]);
    expect(result.valid).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  test("AC-01.04: accepts multiple DOCX files", () => {
    const docxFiles = [
      {
        name: "doc1.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      {
        name: "doc2.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      {
        name: "doc3.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ];

    for (const f of docxFiles) {
      expect(isSupportedFile(f)).toBe(true);
    }

    const result = validateUploadFiles(docxFiles);
    expect(result.valid).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  test("AC-01.03: rejects unsupported files such as .JPG", () => {
    const jpgFile = { name: "foto.jpg", type: "image/jpeg" };
    expect(isSupportedFile(jpgFile)).toBe(false);

    const result = validateUploadFiles([jpgFile]);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toBe(UPLOAD_MESSAGES.UNSUPPORTED);
    expect(result.errorMessage).toBe("Tipe file tidak didukung");
  });

  test("rejects a batch if any file is unsupported", () => {
    const mixedFiles = [
      { name: "laporan.pdf", type: "application/pdf" },
      { name: "gambar.png", type: "image/png" },
    ];
    const result = validateUploadFiles(mixedFiles);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toBe(UPLOAD_MESSAGES.UNSUPPORTED);
  });

  test("rejects empty file array", () => {
    const result = validateUploadFiles([]);
    expect(result.valid).toBe(false);
  });

  test("AC-02.01 & AC-01.01: message constants match acceptance criteria", () => {
    expect(UPLOAD_MESSAGES.SUCCESS).toBe("File diterima untuk diproses");
    expect(UPLOAD_MESSAGES.DUPLICATE).toBe("File ini sudah ada");
    expect(UPLOAD_MESSAGES.UNSUPPORTED).toBe("Tipe file tidak didukung");
  });
});
