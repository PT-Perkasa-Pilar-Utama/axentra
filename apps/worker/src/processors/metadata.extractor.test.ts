import { describe, expect, it } from "bun:test";
import { deflateSync } from "node:zlib";
import { extractMetadataFromBuffer } from "./metadata.extractor";

const FILENAME = "laporan.pdf";
const MIME_TYPE = "application/pdf";
const PADDING_LINE = "% padding line for the metadata scan\n";

function pdfWithAuthorAfterPadding(authorEntry: string): Uint8Array {
  const padding = PADDING_LINE.repeat(400);
  return new TextEncoder().encode(
    `%PDF-1.7\n${padding}1 0 obj\n<< /Title (Laporan Riset) ${authorEntry} >>\nendobj\n%%EOF`,
  );
}

describe("PDF /Author extraction (AC-03.01)", () => {
  it("extracts an /Author entry placed after the first 8 KiB of the file", () => {
    const bytes = pdfWithAuthorAfterPadding("/Author (Dr. Siti Rahma)");

    expect(bytes.byteLength).toBeGreaterThan(8192);
    const result = extractMetadataFromBuffer(FILENAME, MIME_TYPE, bytes);

    expect(result.author).toBe("Dr. Siti Rahma");
    expect(result.rawMetadata).toMatchObject({ method: "pdf_info_dict", detected: true });
  });

  it("extracts a hex-encoded /Author entry placed after the first 8 KiB", () => {
    const hex = Buffer.from("Dr. Siti Rahma", "utf-8").toString("hex");
    const bytes = pdfWithAuthorAfterPadding(`/Author <${hex}>`);

    expect(bytes.byteLength).toBeGreaterThan(8192);
    expect(extractMetadataFromBuffer(FILENAME, MIME_TYPE, bytes).author).toBe("Dr. Siti Rahma");
  });

  it("still extracts an /Author entry near the start of the file", () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\n/Author (Dr. Siti Rahma)\n%%EOF");

    expect(extractMetadataFromBuffer(FILENAME, MIME_TYPE, bytes).author).toBe("Dr. Siti Rahma");
  });

  it("limitation: does not extract an /Author stored only inside a compressed FlateDecode object stream", () => {
    const compressedObject = deflateSync(Buffer.from("<< /Author (Hidden Author) >>", "utf-8"));
    const objectStream = Buffer.concat([
      Buffer.from(
        `5 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ${compressedObject.byteLength} >>\nstream\n`,
        "latin1",
      ),
      compressedObject,
      Buffer.from("\nendstream\nendobj\n%%EOF", "latin1"),
    ]);

    const result = extractMetadataFromBuffer(FILENAME, MIME_TYPE, new Uint8Array(objectStream));

    expect(result.author).toBeNull();
    expect(result.rawMetadata).toMatchObject({ method: "none", detected: false });
  });
});
