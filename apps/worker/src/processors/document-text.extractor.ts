import { inflateRawSync, inflateSync } from "node:zlib";
import { extractTextFromDocxBuffer } from "./document-text.docx";

export const MAX_PDF_SCAN_BYTES = 1024 * 1024; // 1 MiB
export const MAX_PDF_STREAM_DECOMPRESSED_BYTES = 256 * 1024; // 256 KiB per stream (F1)
export const MAX_PDF_TOTAL_DECOMPRESSED_BYTES = 512 * 1024; // 512 KiB total cumulative (F1)
export const MAX_EXTRACTED_CHARS = 100_000;

export { extractTextFromDocxBuffer } from "./document-text.docx";

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

function isBufferTooLargeError(err: unknown): boolean {
  if (err instanceof RangeError) return true;
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: string }).code;
    if (code === "ERR_BUFFER_TOO_LARGE") return true;
    const msg = (err as { message?: string }).message;
    if (typeof msg === "string" && msg.includes("larger than")) return true;
  }
  return false;
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
    if (totalDecompressedBytes >= MAX_PDF_TOTAL_DECOMPRESSED_BYTES) break;

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
      let decompressed = false;

      try {
        const decompressedBuf = inflateSync(streamBytes, {
          finishFlush: 2,
          maxOutputLength: remainingBudget,
        });
        streamContent = decompressedBuf.toString("latin1");
        totalDecompressedBytes += decompressedBuf.length;
        decompressed = true;
      } catch (err) {
        if (isBufferTooLargeError(err)) {
          totalDecompressedBytes += remainingBudget;
        } else {
          try {
            const rawDecompressed = inflateRawSync(streamBytes, {
              maxOutputLength: remainingBudget,
            });
            streamContent = rawDecompressed.toString("latin1");
            totalDecompressedBytes += rawDecompressed.length;
            decompressed = true;
          } catch (rawErr) {
            if (isBufferTooLargeError(rawErr)) {
              totalDecompressedBytes += remainingBudget;
            }
          }
        }
      }

      // Hentikan parsing saat budget kumulatif habis (F1)
      if (totalDecompressedBytes >= MAX_PDF_TOTAL_DECOMPRESSED_BYTES && !decompressed) {
        break;
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
