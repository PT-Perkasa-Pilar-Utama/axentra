import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CD_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const MAX_CORE_XML_BYTES = 512 * 1024; // 512 KiB
const MAX_CENTRAL_DIRECTORY_ENTRIES = 500;
export const MAX_SMART_TAGS_PER_DOCUMENT = 3;

const STOP_WORDS = new Set([
  "and",
  "or",
  "the",
  "for",
  "with",
  "dan",
  "yang",
  "untuk",
  "dengan",
  "pada",
  "dari",
  "ini",
  "itu",
  "ke",
  "di",
  "dokumen",
  "document",
  "file",
  "pdf",
  "docx",
  "doc",
]);

const KNOWN_KEYWORDS: ReadonlyArray<string> = [
  "finance",
  "keuangan",
  "legal",
  "hukum",
  "strategy",
  "strategi",
  "reporting",
  "laporan",
  "contract",
  "kontrak",
  "hr",
  "sdm",
  "tax",
  "pajak",
  "audit",
  "budget",
  "anggaran",
  "operations",
  "operasional",
  "compliance",
  "marketing",
  "invoice",
  "faktur",
  "procurement",
  "pengadaan",
  "research",
  "riset",
];

export function normalizeTagName(raw: string): string | null {
  const unescaped = raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  const normalized = unescaped
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

  if (normalized.length < 2 || normalized.length > 50) return null;
  if (/^\d+$/.test(normalized)) return null;
  if (STOP_WORDS.has(normalized)) return null;

  return normalized;
}

function extractFromDocxCoreXml(buffer: Uint8Array): ReadonlyArray<string> {
  if (buffer.length < 22) return [];

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

  if (eocdOffset === -1) return [];

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(eocdOffset, true) !== EOCD_SIGNATURE) return [];

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  if (cdOffset + cdSize > buffer.length) return [];

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
      if (uncompressedSize > MAX_CORE_XML_BYTES) return [];
      if (localHeaderOffset + 30 > buffer.length) return [];

      const localSig = view.getUint32(localHeaderOffset, true);
      if (localSig !== LOCAL_HEADER_SIGNATURE) return [];

      const localFilenameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataOffset = localHeaderOffset + 30 + localFilenameLen + localExtraLen;

      if (dataOffset + compressedSize > buffer.length) return [];

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
          return [];
        }
      } else {
        return [];
      }

      const results: string[] = [];
      const keywordsMatch = xmlText.match(/<cp:keywords(?:[^>]*)>([^<]+)<\/cp:keywords>/i);
      if (keywordsMatch?.[1]) {
        for (const part of keywordsMatch[1].split(/[,;|\s]+/)) {
          const normalized = normalizeTagName(part);
          if (normalized) results.push(normalized);
        }
      }
      const subjectMatch = xmlText.match(/<dc:subject(?:[^>]*)>([^<]+)<\/dc:subject>/i);
      if (subjectMatch?.[1]) {
        const normalized = normalizeTagName(subjectMatch[1]);
        if (normalized) results.push(normalized);
      }

      return results;
    }

    offset += 46 + filenameLen + extraLen + commentLen;
  }

  return [];
}

function extractFromPdfKeywords(buffer: Uint8Array): ReadonlyArray<string> {
  const headLength = Math.min(buffer.length, 8192);
  const text = Buffer.from(buffer.subarray(0, headLength)).toString("latin1");
  const results: string[] = [];

  const kwMatch = text.match(/\/Keywords\s*\(([^)\\]*(?:\\.[^)\\]*)*)\)/);
  if (kwMatch?.[1]) {
    for (const part of kwMatch[1].split(/[,;|\s]+/)) {
      const normalized = normalizeTagName(part);
      if (normalized) results.push(normalized);
    }
  }

  const subjectMatch = text.match(/\/Subject\s*\(([^)\\]*(?:\\.[^)\\]*)*)\)/);
  if (subjectMatch?.[1]) {
    const normalized = normalizeTagName(subjectMatch[1]);
    if (normalized) results.push(normalized);
  }

  return results;
}

function extractFromFilename(filename: string): ReadonlyArray<string> {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const parts = nameWithoutExt.split(/[-_\s.]+/);
  const results: string[] = [];

  for (const part of parts) {
    const normalized = normalizeTagName(part);
    if (normalized) results.push(normalized);
  }

  return results;
}

function extractFromContentText(content: string): ReadonlyArray<string> {
  const results: string[] = [];
  const lower = content.toLowerCase();

  for (const kw of KNOWN_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(lower)) {
      const normalized = normalizeTagName(kw);
      if (normalized) results.push(normalized);
    }
  }

  return results;
}

export function extractSmartTagsFromBuffer(
  filename: string,
  mimeType: string,
  buffer: Uint8Array,
  rawText?: string,
): ReadonlyArray<string> {
  const candidates: string[] = [];

  // 1. Check rawText if provided
  if (rawText && rawText.trim().length > 0) {
    candidates.push(...extractFromContentText(rawText));
  }

  // 2. Check DOCX core xml
  const isDocx =
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.toLowerCase().endsWith(".docx");

  if (isDocx) {
    candidates.push(...extractFromDocxCoreXml(buffer));
  }

  // 3. Check PDF keywords
  const isPdf = mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    candidates.push(...extractFromPdfKeywords(buffer));
  }

  // 4. Scan printable buffer content for known keywords
  const bufferScanSlice = buffer.subarray(0, Math.min(buffer.length, 16384));
  const textSample = Buffer.from(bufferScanSlice).toString("utf-8");
  candidates.push(...extractFromContentText(textSample));

  // 5. Check filename tokens
  candidates.push(...extractFromFilename(filename));

  // Deduplicate preserving order
  const uniqueTags: string[] = [];
  for (const tag of candidates) {
    if (!uniqueTags.includes(tag)) {
      uniqueTags.push(tag);
    }
    if (uniqueTags.length >= MAX_SMART_TAGS_PER_DOCUMENT) {
      break;
    }
  }

  return uniqueTags;
}
