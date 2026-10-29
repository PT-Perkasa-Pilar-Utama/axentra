import { describe, expect, test } from "bun:test";
import { bulkDownloadRequestSchema, BULK_DOWNLOAD_MAX_DOCUMENTS } from "@axentra/shared";
import {
  BULK_DOWNLOAD_VALIDATION_MESSAGES,
  bulkDownloadValidationMessage,
} from "./bulk-download.validation";

// F17: each validation message is Bahasa Indonesia and comes from the Zod issue code and path, because
// Zod fills its own default messages in English. The inputs below go through the real request schema.

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

function messageFor(body: unknown): string {
  const parsed = bulkDownloadRequestSchema.safeParse(body);
  if (parsed.success) throw new Error("expected the request body to be rejected");
  return bulkDownloadValidationMessage(parsed.error.issues);
}

describe("bulk download body validation messages (F17)", () => {
  test("a body that is not a JSON object reports the object requirement", () => {
    expect(messageFor(null)).toBe("Payload unduhan massal harus berupa objek JSON");
    expect(messageFor("documentIds")).toBe("Payload unduhan massal harus berupa objek JSON");
  });

  test("a missing documentIds field reports that the list must be an array", () => {
    expect(messageFor({})).toBe("Daftar ID dokumen harus berupa array");
  });

  test("a documentIds value that is not an array reports that the list must be an array", () => {
    expect(messageFor({ documentIds: VALID_UUID })).toBe("Daftar ID dokumen harus berupa array");
  });

  test("an empty documentIds list reports the minimum of one document", () => {
    expect(messageFor({ documentIds: [] })).toBe("Minimal satu dokumen harus dipilih");
  });

  test("more than the maximum number of documents reports the maximum", () => {
    const tooMany = Array.from({ length: BULK_DOWNLOAD_MAX_DOCUMENTS + 1 }, () => VALID_UUID);
    expect(messageFor({ documentIds: tooMany })).toBe("Maksimal 100 dokumen per unduhan massal");
  });

  test("a value that is not a UUID string reports the UUID requirement", () => {
    expect(messageFor({ documentIds: ["bukan-uuid"] })).toBe(
      "ID dokumen harus berupa UUID yang valid",
    );
  });

  test("a non-string document ID reports the UUID requirement", () => {
    expect(messageFor({ documentIds: [123] })).toBe("ID dokumen harus berupa UUID yang valid");
  });

  test("the first failing issue decides the message when several fail", () => {
    expect(messageFor({ documentIds: ["bukan-uuid", VALID_UUID, 42] })).toBe(
      "ID dokumen harus berupa UUID yang valid",
    );
  });

  test("an issue code without a specific mapping falls back to the generic payload message", () => {
    expect(bulkDownloadValidationMessage([{ code: "custom", path: ["documentIds", 0] }])).toBe(
      BULK_DOWNLOAD_VALIDATION_MESSAGES.invalidPayload,
    );
    expect(bulkDownloadValidationMessage([{ code: "unrecognized_keys", path: [] }])).toBe(
      "Payload unduhan massal tidak valid",
    );
  });

  test("an issue list with no entries falls back to the generic payload message", () => {
    expect(bulkDownloadValidationMessage([])).toBe("Payload unduhan massal tidak valid");
  });

  test("no mapped message contains the English Zod default wording", () => {
    const messages = [
      messageFor(null),
      messageFor({}),
      messageFor({ documentIds: [] }),
      messageFor({ documentIds: ["bukan-uuid"] }),
    ];
    for (const message of messages) {
      expect(message).not.toMatch(/Required|Expected|must|at least|invalid/i);
    }
  });
});
