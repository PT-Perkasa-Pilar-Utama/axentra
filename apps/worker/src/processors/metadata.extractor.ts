import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CD_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const MAX_CORE_XML_BYTES = 512 * 1024; // 512 KiB
const MAX_CENTRAL_DIRECTORY_ENTRIES = 500;

export type ExtractedMetadataResult = {
  author: string | null;
  rawMetadata: Record<string, unknown>;
  extractedAt: Date;
};

function cleanAuthorString(raw: string): string | null {
  const unescaped = raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  const cleaned = unescaped
    .replace(/[\0\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length === 0 || cleaned.length > 255) {
    return null;
  }
  return cleaned;
}

function extractFromPdfBuffer(buffer: Uint8Array): string | null {
  const headLength = Math.min(buffer.length, 8192);
  const headText = Buffer.from(buffer.subarray(0, headLength)).toString("latin1");

  const authorMatch = headText.match(/\/Author\s*\(([^)\\]*(?:\\.[^)\\]*)*)\)/);
  if (authorMatch?.[1]) {
    const unescaped = authorMatch[1].replace(/\\([()\\])/g, "$1");
    const cleaned = cleanAuthorString(unescaped);
    if (cleaned) return cleaned;
  }

  const hexAuthorMatch = headText.match(/\/Author\s*<([0-9a-fA-F]+)>/);
  if (hexAuthorMatch?.[1]) {
    try {
      const decoded = Buffer.from(hexAuthorMatch[1], "hex").toString("utf-8");
      const cleaned = cleanAuthorString(decoded);
      if (cleaned) return cleaned;
    } catch {
      // Ignore hex decode failure
    }
  }

  return null;
}

function extractFromDocxBuffer(buffer: Uint8Array): string | null {
  if (buffer.length < 22) return null;

  const maxSearch = Math.min(buffer.length, 65557);
  const minOffset = buffer.length - maxSearch;
  let eocdOffset = -1;

  for (let i = buffer.length - 22; i >= minOffset; i--) {
    if (
      buffer[i] === 0x50 &&
      buffer[i + 1] === 0x4b &&
      buffer[i + 2] === 0x05 &&
      buffer[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) return null;

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(eocdOffset, true) !== EOCD_SIGNATURE) {
    return null;
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  if (cdOffset + cdSize > buffer.length) return null;

  let offset = cdOffset;
  const maxEntries = Math.min(totalEntries, MAX_CENTRAL_DIRECTORY_ENTRIES);

  for (let i = 0; i < maxEntries; i++) {
    if (offset + 46 > buffer.length) break;
    const sig = view.getUint32(offset, true);
    if (sig !== CD_HEADER_SIGNATURE) break;

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const filenameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    if (offset + 46 + filenameLen > buffer.length) break;
    const filename = Buffer.from(buffer.subarray(offset + 46, offset + 46 + filenameLen)).toString(
      "utf-8",
    );

    if (filename === "docProps/core.xml") {
      if (uncompressedSize > MAX_CORE_XML_BYTES) return null;
      if (localHeaderOffset + 30 > buffer.length) return null;

      const localSig = view.getUint32(localHeaderOffset, true);
      if (localSig !== LOCAL_HEADER_SIGNATURE) return null;

      const localFilenameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataOffset = localHeaderOffset + 30 + localFilenameLen + localExtraLen;

      if (dataOffset + compressedSize > buffer.length) return null;

      let xmlText = "";
      if (compressionMethod === 0) {
        xmlText = Buffer.from(buffer.subarray(dataOffset, dataOffset + compressedSize)).toString(
          "utf-8",
        );
      } else if (compressionMethod === 8) {
        const compressedChunk = buffer.subarray(dataOffset, dataOffset + compressedSize);
        try {
          const decompressed = inflateRawSync(compressedChunk, {
            maxOutputLength: MAX_CORE_XML_BYTES,
          });
          xmlText = decompressed.toString("utf-8");
        } catch {
          return null;
        }
      } else {
        return null;
      }

      const creatorMatch = xmlText.match(/<dc:creator(?:[^>]*)>([^<]+)<\/dc:creator>/i);
      if (creatorMatch?.[1]) {
        return cleanAuthorString(creatorMatch[1]);
      }
      const modifiedMatch = xmlText.match(
        /<cp:lastModifiedBy(?:[^>]*)>([^<]+)<\/cp:lastModifiedBy>/i,
      );
      if (modifiedMatch?.[1]) {
        return cleanAuthorString(modifiedMatch[1]);
      }
      return null;
    }

    offset += 46 + filenameLen + extraLen + commentLen;
  }

  return null;
}

export function extractMetadataFromBuffer(
  filename: string,
  mimeType: string,
  buffer: Uint8Array,
): ExtractedMetadataResult {
  const extractedAt = new Date();

  // 1. PDF
  const isPdf =
    mimeType === "application/pdf" ||
    filename.toLowerCase().endsWith(".pdf") ||
    (buffer.length >= 4 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46);

  if (isPdf) {
    const pdfAuthor = extractFromPdfBuffer(buffer);
    if (pdfAuthor) {
      return {
        author: pdfAuthor,
        rawMetadata: {
          extractor: "worker-deterministic",
          method: "pdf_info_dict",
          detected: true,
        },
        extractedAt,
      };
    }
  }

  // 2. DOCX
  const isDocx =
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.toLowerCase().endsWith(".docx") ||
    (buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04);

  if (isDocx) {
    const docxAuthor = extractFromDocxBuffer(buffer);
    if (docxAuthor) {
      return {
        author: docxAuthor,
        rawMetadata: {
          extractor: "worker-deterministic",
          method: "docx_xml_core",
          detected: true,
        },
        extractedAt,
      };
    }
  }

  // 3. Fallback: No author detected
  return {
    author: null,
    rawMetadata: {
      extractor: "worker-deterministic",
      method: "none",
      detected: false,
    },
    extractedAt,
  };
}
