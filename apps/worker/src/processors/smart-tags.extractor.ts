import { extractDocumentBodyText } from "./document-text.extractor";
import { KNOWN_KEYWORDS, MAX_SMART_TAGS_PER_DOCUMENT, STOP_WORDS } from "./smart-tags.constants";
import { extractFromDocxCoreXml } from "./smart-tags.docx-core";

export { MAX_SMART_TAGS_PER_DOCUMENT } from "./smart-tags.constants";

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

/**
 * Extracts up to 3 Smart Tags for a document.
 * Priority order:
 * 1. Document body text content keywords (representing actual document content per AC-04.02)
 * 2. Document metadata keywords (DOCX core.xml / PDF keywords & subject)
 * 3. Filename tokens (fallback when body content and metadata yield fewer than 3 tags)
 */
export function extractSmartTagsFromBuffer(
  filename: string,
  mimeType: string,
  buffer: Uint8Array,
  rawText?: string,
): ReadonlyArray<string> {
  const contentCandidates: string[] = [];
  const metadataCandidates: string[] = [];
  const fallbackCandidates: string[] = [];

  // 1. Primary: Extract from provided rawText or auto-extracted document body text
  const bodyText =
    rawText && rawText.trim().length > 0
      ? rawText
      : extractDocumentBodyText(filename, mimeType, buffer);

  if (bodyText.length > 0) {
    contentCandidates.push(...extractFromContentText(bodyText));
  }

  // 2. Secondary: Document metadata keywords
  const isDocx =
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.toLowerCase().endsWith(".docx");

  if (isDocx) {
    metadataCandidates.push(...extractFromDocxCoreXml(buffer, normalizeTagName));
  }

  const isPdf = mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    metadataCandidates.push(...extractFromPdfKeywords(buffer));
  }

  // 3. Fallback: Filename tokens only if needed
  fallbackCandidates.push(...extractFromFilename(filename));

  // Merge with strict priority: Content > Metadata > Fallback
  const uniqueTags: string[] = [];
  const addCandidate = (tag: string) => {
    if (!uniqueTags.includes(tag) && uniqueTags.length < MAX_SMART_TAGS_PER_DOCUMENT) {
      uniqueTags.push(tag);
    }
  };

  for (const tag of contentCandidates) addCandidate(tag);
  for (const tag of metadataCandidates) addCandidate(tag);
  for (const tag of fallbackCandidates) addCandidate(tag);

  return uniqueTags;
}
