import { describe, expect, test } from "bun:test";
import {
  DOCUMENT_COPY,
  DOCUMENT_ERROR_CODES,
  DOCUMENT_MIME_ALLOWLIST_BY_TYPE,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  documentUploadAcceptedDataSchema,
  documentUploadFileMetaSchema,
  getDocumentExtension,
  getDocumentTypeFromFilename,
  isSupportedDocumentExtension,
  isSupportedDocumentMimeType,
} from "../src/documents";
import { authUserSchema, isValidUserRole } from "../src/auth";

describe("document shared contracts", () => {
  test("extracts file extension accurately and in lowercase", () => {
    expect(getDocumentExtension("laporan.pdf")).toBe(".pdf");
    expect(getDocumentExtension("LAPORAN.PDF")).toBe(".pdf");
    expect(getDocumentExtension("file.docx")).toBe(".docx");
    expect(getDocumentExtension("archive.tar.gz")).toBe(".gz");
    expect(getDocumentExtension("noextension")).toBe("");
    expect(getDocumentExtension("trailingdot.")).toBe("");
  });

  test("validates supported extensions allowlist", () => {
    expect(isSupportedDocumentExtension(".pdf")).toBe(true);
    expect(isSupportedDocumentExtension(".docx")).toBe(true);
    expect(isSupportedDocumentExtension(".PDF")).toBe(true);
    expect(isSupportedDocumentExtension(".DOCX")).toBe(true);

    // Unsupported
    expect(isSupportedDocumentExtension(".jpg")).toBe(false);
    expect(isSupportedDocumentExtension(".JPG")).toBe(false);
    expect(isSupportedDocumentExtension(".jpeg")).toBe(false);
    expect(isSupportedDocumentExtension(".png")).toBe(false);
    expect(isSupportedDocumentExtension(".exe")).toBe(false);
    expect(isSupportedDocumentExtension(".txt")).toBe(false);
  });

  test("validates supported MIME types allowlist", () => {
    expect(isSupportedDocumentMimeType("application/pdf")).toBe(true);
    expect(
      isSupportedDocumentMimeType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);

    // Unsupported
    expect(isSupportedDocumentMimeType("image/jpeg")).toBe(false);
    expect(isSupportedDocumentMimeType("image/png")).toBe(false);
    expect(isSupportedDocumentMimeType("text/plain")).toBe(false);
    expect(isSupportedDocumentMimeType("application/octet-stream")).toBe(false);
  });

  test("derives document type from filename", () => {
    expect(getDocumentTypeFromFilename("document.pdf")).toBe("pdf");
    expect(getDocumentTypeFromFilename("report.DOCX")).toBe("docx");
    expect(getDocumentTypeFromFilename("photo.jpg")).toBeNull();
    expect(getDocumentTypeFromFilename("archive.zip")).toBeNull();
  });

  test("maps document types to allowed MIME types correctly", () => {
    expect(DOCUMENT_MIME_ALLOWLIST_BY_TYPE.pdf).toContain("application/pdf");
    expect(DOCUMENT_MIME_ALLOWLIST_BY_TYPE.pdf).not.toContain("application/x-pdf");
    expect(DOCUMENT_MIME_ALLOWLIST_BY_TYPE.docx).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(DOCUMENT_MIME_ALLOWLIST_BY_TYPE.docx).not.toContain("application/zip");
    expect(DOCUMENT_MIME_ALLOWLIST_BY_TYPE.docx).not.toContain("application/x-zip-compressed");
  });

  test("validates document upload schemas with Zod", () => {
    const validMeta = {
      filename: "dokumen.pdf",
      size: 1024,
      documentType: "pdf",
    };
    expect(documentUploadFileMetaSchema.safeParse(validMeta).success).toBe(true);

    const invalidSize = {
      filename: "dokumen.pdf",
      size: MAX_DOCUMENT_FILE_SIZE_BYTES + 1,
      documentType: "pdf",
    };
    expect(documentUploadFileMetaSchema.safeParse(invalidSize).success).toBe(false);

    const acceptedPayload = {
      message: DOCUMENT_COPY.UPLOAD_ACCEPTED,
      count: 1,
      files: [validMeta],
    };
    expect(documentUploadAcceptedDataSchema.safeParse(acceptedPayload).success).toBe(true);

    const wrongMessagePayload = {
      message: "Sukses",
      count: 1,
      files: [validMeta],
    };
    expect(documentUploadAcceptedDataSchema.safeParse(wrongMessagePayload).success).toBe(false);
  });

  test("exposes stable error codes and copy", () => {
    expect(DOCUMENT_COPY.UNSUPPORTED_TYPE).toBe("Tipe file tidak didukung");
    expect(DOCUMENT_COPY.UPLOAD_ACCEPTED).toBe("File diterima untuk diproses");
    expect(DOCUMENT_COPY.DUPLICATE_WARNING).toBe("File ini sudah ada");
    expect(DOCUMENT_ERROR_CODES.UNSUPPORTED_FILE_TYPE).toBe("UNSUPPORTED_FILE_TYPE");
  });

  test("validates user roles and auth contracts", () => {
    expect(isValidUserRole("member_team")).toBe(true);
    expect(isValidUserRole("head_of_team")).toBe(true);
    expect(isValidUserRole("admin")).toBe(false);
    expect(isValidUserRole("guest")).toBe(false);

    const validUser = {
      id: "usr-1",
      email: "member@axentra.local",
      role: "member_team",
    };
    expect(authUserSchema.safeParse(validUser).success).toBe(true);

    const invalidUser = {
      id: "usr-2",
      email: "not-an-email",
      role: "superuser",
    };
    expect(authUserSchema.safeParse(invalidUser).success).toBe(false);
  });
});
