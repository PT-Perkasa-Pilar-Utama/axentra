import { inflateRawSync, inflateSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CD_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const MAX_DOCX_XML_BYTES = 1024 * 1024; // 1 MiB
const MAX_CENTRAL_DIRECTORY_ENTRIES = 500;
const MAX_PDF_SCAN_BYTES = 1024 * 1024; // 1 MiB
export const MAX_PDF_STREAM_DECOMPRESSED_BYTES = 256 * 1024; // 256 KiB per stream (F1)
export const MAX_PDF_TOTAL_DECOMPRESSED_BYTES = 512 * 1024; // 512 KiB total cumulative (F1)
export const MAX_EXTRACTED_CHARS = 100_000;

function unescapeXml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function unescapePdfString(raw: string): string {
  return raw
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

/**
 * Decodes a PDF hexadecimal string literal (<48656c6c6f>).
 * Handles odd-digit padding and UTF-16BE encoding with BOM.
 */
export function decodePdfHexString(raw: string): string {
  const cleaned = raw.replace(/\s+/g, "");
  if (cleaned.length === 0 || !/^[0-9a-fA-F]+$/.test(cleaned)) return "";
  const normalized = cleaned.length % 2 === 1 ? `${cleaned}0` : cleaned;
  try {
    const buf = Buffer.from(normalized, "hex");
    if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
      return buf.subarray(2).swap16().toString("utf-16le");
    }
    return buf.toString("utf-8");
  } catch {
    return "";
  }
}

/**
 * Extracts raw body text from a DOCX buffer by reading word/document.xml.
 */
export function extractTextFromDocxBuffer(buffer: Uint8Array): string {
  if (buffer.length < 22) return "";

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

  if (eocdOffset === -1) return "";

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(eocdOffset, true) !== EOCD_SIGNATURE) return "";

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  if (cdOffset + cdSize > buffer.length) return "";

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

    if (filename === "word/document.xml") {
      if (uncompressedSize > MAX_DOCX_XML_BYTES) return "";
      if (localHeaderOffset + 30 > buffer.length) return "";

      const localSig = view.getUint32(localHeaderOffset, true);
      if (localSig !== LOCAL_HEADER_SIGNATURE) return "";

      const localFilenameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataOffset = localHeaderOffset + 30 + localFilenameLen + localExtraLen;

      if (dataOffset + compressedSize > buffer.length) return "";

      let xmlText = "";
      if (compressionMethod === 0) {
        xmlText = Buffer.from(buffer.subarray(dataOffset, dataOffset + compressedSize)).toString(
          "utf-8",
        );
      } else if (compressionMethod === 8) {
        const compressedChunk = buffer.subarray(dataOffset, dataOffset + compressedSize);
        try {
          const decompressed = inflateRawSync(compressedChunk, {
            maxOutputLength: MAX_DOCX_XML_BYTES,
          });
          xmlText = decompressed.toString("utf-8");
        } catch {
          return "";
        }
      } else {
        return "";
      }

      const textParts: string[] = [];
      const textRegex = /<w:t(?:[^>]*)>([^<]+)<\/w:t>/gi;
      let match: RegExpExecArray | null;
      let collectedLen = 0;
      while ((match = textRegex.exec(xmlText)) !== null) {
        if (match[1]) {
          const text = unescapeXml(match[1]);
          textParts.push(text);
          collectedLen += text.length;
          if (collectedLen >= MAX_EXTRACTED_CHARS) break;
        }
      }

      return textParts.join(" ").slice(0, MAX_EXTRACTED_CHARS);
    }

    offset += 46 + filenameLen + extraLen + commentLen;
  }

  return "";
}

/**
 * Extracts raw body text from a PDF buffer by reading content streams.
 * Bounded by decompression size quotas and character limits (F1).
 * Supports both literal strings and hexadecimal string operands (F2).
 */
export function extractTextFromPdfBuffer(buffer: Uint8Array): string {
  const scanLimit = Math.min(buffer.length, MAX_PDF_SCAN_BYTES);
  const scanSlice = buffer.subarray(0, scanLimit);
  const latin1 = Buffer.from(scanSlice).toString("latin1");

  const textFragments: string[] = [];
  let totalExtractedLength = 0;
  let totalDecompressedBytes = 0;

  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(latin1)) !== null) {
    if (totalExtractedLength >= MAX_EXTRACTED_CHARS) break;

    const rawStream = match[1];
    if (!rawStream) continue;

    let streamContent = rawStream;
    const streamBytes = Buffer.from(rawStream, "latin1");

    // Attempt bounded flate decompression if within cumulative budget (F1)
    if (totalDecompressedBytes < MAX_PDF_TOTAL_DECOMPRESSED_BYTES) {
      const remainingBudget = Math.min(
        MAX_PDF_STREAM_DECOMPRESSED_BYTES,
        MAX_PDF_TOTAL_DECOMPRESSED_BYTES - totalDecompressedBytes,
      );
      try {
        const decompressed = inflateSync(streamBytes, {
          finishFlush: 2,
          maxOutputLength: remainingBudget,
        });
        streamContent = decompressed.toString("latin1");
        totalDecompressedBytes += decompressed.length;
      } catch {
        try {
          const rawDecompressed = inflateRawSync(streamBytes, {
            maxOutputLength: remainingBudget,
          });
          streamContent = rawDecompressed.toString("latin1");
          totalDecompressedBytes += rawDecompressed.length;
        } catch {
          // Fall back to uncompressed streamContent
        }
      }
    }

    const appendText = (text: string) => {
      if (!text || totalExtractedLength >= MAX_EXTRACTED_CHARS) return;
      const allowed = text.slice(0, MAX_EXTRACTED_CHARS - totalExtractedLength);
      textFragments.push(allowed);
      totalExtractedLength += allowed.length;
    };

    // 1. Literal text: (text) Tj
    const tjLiteralRegex = /\((.*?)\)\s*Tj/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjLiteralRegex.exec(streamContent)) !== null) {
      if (tjMatch[1]) appendText(unescapePdfString(tjMatch[1]));
      if (totalExtractedLength >= MAX_EXTRACTED_CHARS) break;
    }

    // 2. Hex text: <hex> Tj (F2)
    const tjHexRegex = /<([0-9a-fA-F\s]+)>\s*Tj/g;
    let hexTjMatch: RegExpExecArray | null;
    while ((hexTjMatch = tjHexRegex.exec(streamContent)) !== null) {
      if (hexTjMatch[1]) appendText(decodePdfHexString(hexTjMatch[1]));
      if (totalExtractedLength >= MAX_EXTRACTED_CHARS) break;
    }

    // 3. TJ array: [(t1) 10 <hex2>] TJ (F2)
    const tjArrayRegex = /\[((?:[^\]\\]|\\.)*)\]\s*TJ/g;
    let arrayMatch: RegExpExecArray | null;
    while ((arrayMatch = tjArrayRegex.exec(streamContent)) !== null) {
      const inner = arrayMatch[1];
      if (inner) {
        const itemRegex = /\((.*?)\)|<([0-9a-fA-F\s]+)>/g;
        let itemMatch: RegExpExecArray | null;
        while ((itemMatch = itemRegex.exec(inner)) !== null) {
          if (itemMatch[1]) {
            appendText(unescapePdfString(itemMatch[1]));
          } else if (itemMatch[2]) {
            appendText(decodePdfHexString(itemMatch[2]));
          }
          if (totalExtractedLength >= MAX_EXTRACTED_CHARS) break;
        }
      }
      if (totalExtractedLength >= MAX_EXTRACTED_CHARS) break;
    }
  }

  return textFragments.join(" ");
}

/**
 * Bounded document body text extractor for supported document formats (DOCX and PDF).
 */
export function extractDocumentBodyText(
  filename: string,
  mimeType: string,
  buffer: Uint8Array,
): string {
  const isDocx =
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.toLowerCase().endsWith(".docx");

  if (isDocx) {
    return extractTextFromDocxBuffer(buffer);
  }

  const isPdf = mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    return extractTextFromPdfBuffer(buffer);
  }

  return "";
}
