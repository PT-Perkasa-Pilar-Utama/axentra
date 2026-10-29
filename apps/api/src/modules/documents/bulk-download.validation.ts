import { BULK_DOWNLOAD_MAX_DOCUMENTS } from "@axentra/shared";

// The parts of a Zod issue the mapping reads. Zod fills `message` with English text, so the message is
// never forwarded; each issue is mapped by code and path to fixed Bahasa Indonesia copy instead.
export type BulkDownloadValidationIssue = {
  readonly code: string;
  readonly path: ReadonlyArray<PropertyKey>;
};

export const BULK_DOWNLOAD_VALIDATION_MESSAGES = {
  invalidBody: "Payload unduhan massal harus berupa objek JSON",
  invalidDocumentIds: "Daftar ID dokumen harus berupa array",
  tooFewDocuments: "Minimal satu dokumen harus dipilih",
  tooManyDocuments: `Maksimal ${BULK_DOWNLOAD_MAX_DOCUMENTS} dokumen per unduhan massal`,
  invalidDocumentId: "ID dokumen harus berupa UUID yang valid",
  invalidPayload: "Payload unduhan massal tidak valid",
} as const;

function documentIdsMessage(code: string): string {
  switch (code) {
    case "invalid_type":
      return BULK_DOWNLOAD_VALIDATION_MESSAGES.invalidDocumentIds;
    case "too_small":
      return BULK_DOWNLOAD_VALIDATION_MESSAGES.tooFewDocuments;
    case "too_big":
      return BULK_DOWNLOAD_VALIDATION_MESSAGES.tooManyDocuments;
    default:
      return BULK_DOWNLOAD_VALIDATION_MESSAGES.invalidPayload;
  }
}

function documentIdMessage(code: string): string {
  switch (code) {
    case "invalid_type":
    case "invalid_format":
      return BULK_DOWNLOAD_VALIDATION_MESSAGES.invalidDocumentId;
    default:
      return BULK_DOWNLOAD_VALIDATION_MESSAGES.invalidPayload;
  }
}

function messageForIssue(issue: BulkDownloadValidationIssue): string {
  const [field, index] = issue.path;
  if (field === undefined) {
    return issue.code === "invalid_type"
      ? BULK_DOWNLOAD_VALIDATION_MESSAGES.invalidBody
      : BULK_DOWNLOAD_VALIDATION_MESSAGES.invalidPayload;
  }
  if (field !== "documentIds") return BULK_DOWNLOAD_VALIDATION_MESSAGES.invalidPayload;
  return index === undefined ? documentIdsMessage(issue.code) : documentIdMessage(issue.code);
}

/**
 * Bahasa Indonesia message for the first validation issue of a bulk download request body. The error
 * code stays VALIDATION_ERROR; only the message is mapped.
 */
export function bulkDownloadValidationMessage(
  issues: ReadonlyArray<BulkDownloadValidationIssue>,
): string {
  const [firstIssue] = issues;
  return firstIssue === undefined
    ? BULK_DOWNLOAD_VALIDATION_MESSAGES.invalidPayload
    : messageForIssue(firstIssue);
}
