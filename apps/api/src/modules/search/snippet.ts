export type HighlightRange = {
  start: number;
  end: number;
};

export type SnippetResult = {
  snippet: string;
  highlights: HighlightRange[];
};

export type SnippetSegment = {
  text: string;
  isMatch: boolean;
};

const DEFAULT_RADIUS = 50;

/**
 * Generates a clean plain-text snippet around the matching keyword,
 * accompanied by structured highlight character offsets (start, end).
 *
 * Design:
 * - Returns clean plain text: NO HTML markup (like <strong>) and NO entity encoding.
 * - Callers can safely render {item.snippet} directly as plain text in React.
 * - Callers can use splitSnippetIntoSegments(snippet, highlights) to render React
 *   elements without dangerouslySetInnerHTML.
 * - Extracts context around the match (~50 chars before and after).
 * - Preserves natural word boundaries at start and end.
 * - Adds ellipsis ("...") when context is truncated.
 * - If fallbackToPrefix is true and query is not found, takes the prefix context.
 */
export function generateSnippet(
  sourceText: string | null | undefined,
  query: string | null | undefined,
  options?: {
    contextRadius?: number;
    fallbackToPrefix?: boolean;
  },
): SnippetResult | null {
  if (!sourceText || sourceText.trim().length === 0) {
    return null;
  }

  const normalized = sourceText.replace(/[\r\n\t]+/g, " ").trim();
  if (normalized.length === 0) {
    return null;
  }

  const q = query?.trim();
  if (!q || q.length === 0) {
    if (options?.fallbackToPrefix) {
      const radius = options?.contextRadius ?? DEFAULT_RADIUS;
      const maxLength = radius * 2;
      const snippet =
        normalized.length > maxLength
          ? `${normalized.slice(0, maxLength).trimEnd()}...`
          : normalized;
      return { snippet, highlights: [] };
    }
    return null;
  }

  const matchIndex = normalized.toLowerCase().indexOf(q.toLowerCase());
  if (matchIndex === -1) {
    if (options?.fallbackToPrefix) {
      const radius = options?.contextRadius ?? DEFAULT_RADIUS;
      const maxLength = radius * 2;
      const snippet =
        normalized.length > maxLength
          ? `${normalized.slice(0, maxLength).trimEnd()}...`
          : normalized;
      return { snippet, highlights: [] };
    }
    return null;
  }

  const radius = options?.contextRadius ?? DEFAULT_RADIUS;
  const matchLength = q.length;

  let start = Math.max(0, matchIndex - radius);
  let end = Math.min(normalized.length, matchIndex + matchLength + radius);

  // Adjust start boundary to not cut words in half
  if (start > 0) {
    const spaceIndex = normalized.indexOf(" ", start);
    if (spaceIndex !== -1 && spaceIndex < matchIndex) {
      start = spaceIndex + 1;
    }
  }

  // Adjust end boundary to not cut words in half
  if (end < normalized.length) {
    const spaceIndex = normalized.lastIndexOf(" ", end);
    if (spaceIndex !== -1 && spaceIndex > matchIndex + matchLength) {
      end = spaceIndex;
    }
  }

  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalized.length ? "..." : "";

  const beforeText = normalized.slice(start, matchIndex);
  const matchedText = normalized.slice(matchIndex, matchIndex + matchLength);
  const afterText = normalized.slice(matchIndex + matchLength, end);

  const snippet = `${prefix}${beforeText}${matchedText}${afterText}${suffix}`;
  const highlightStart = prefix.length + beforeText.length;
  const highlightEnd = highlightStart + matchedText.length;

  return {
    snippet,
    highlights: [{ start: highlightStart, end: highlightEnd }],
  };
}

/**
 * Splits a plain text snippet and its highlight ranges into structured segments.
 * Consumers can safely map these segments to React elements (e.g. <strong>)
 * without interpreting any document text as HTML or using dangerouslySetInnerHTML.
 */
export function splitSnippetIntoSegments(
  snippet: string,
  highlights: ReadonlyArray<HighlightRange>,
): SnippetSegment[] {
  if (!highlights || highlights.length === 0) {
    return [{ text: snippet, isMatch: false }];
  }

  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const segments: SnippetSegment[] = [];
  let cursor = 0;

  for (const hl of sorted) {
    if (hl.start > cursor) {
      segments.push({
        text: snippet.slice(cursor, hl.start),
        isMatch: false,
      });
    }
    segments.push({
      text: snippet.slice(hl.start, hl.end),
      isMatch: true,
    });
    cursor = Math.max(cursor, hl.end);
  }

  if (cursor < snippet.length) {
    segments.push({
      text: snippet.slice(cursor),
      isMatch: false,
    });
  }

  return segments;
}

/**
 * Resolves the most relevant snippet for a document row by checking candidate fields
 * in priority order:
 * 1. extractedText (content match)
 * 2. title (title match)
 * 3. originalName (filename match)
 * 4. Fallback to any available content/title/filename prefix
 *
 * Ensures that whenever a query keyword is provided, a non-null snippet is returned (F1).
 */
export function resolveDocumentSnippet(
  query: string | null | undefined,
  fields: {
    extractedText?: string | null | undefined;
    title?: string | null | undefined;
    originalName?: string | null | undefined;
  },
): { snippet: string | null; highlights: HighlightRange[] } {
  const q = query?.trim();
  if (!q) {
    return { snippet: null, highlights: [] };
  }

  const qLower = q.toLowerCase();

  // 1. Content match
  if (fields.extractedText && fields.extractedText.toLowerCase().includes(qLower)) {
    const res = generateSnippet(fields.extractedText, q);
    if (res) return res;
  }

  // 2. Title match
  if (fields.title && fields.title.toLowerCase().includes(qLower)) {
    const res = generateSnippet(fields.title, q);
    if (res) return res;
  }

  // 3. Filename match
  if (fields.originalName && fields.originalName.toLowerCase().includes(qLower)) {
    const res = generateSnippet(fields.originalName, q);
    if (res) return res;
  }

  // 4. Fallback if matched via tags/category or edge case
  const fallbackSource = fields.extractedText || fields.title || fields.originalName || "";
  const fallbackRes = generateSnippet(fallbackSource, q, { fallbackToPrefix: true });
  return fallbackRes ?? { snippet: fallbackSource.slice(0, 100), highlights: [] };
}
