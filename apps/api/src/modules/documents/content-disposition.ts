import { sanitizeFilename } from "./documents.service.helpers";

export type ContentDispositionType = "inline" | "attachment";

// RFC 5987 attr-char: ALPHA / DIGIT / "!" / "#" / "$" / "&" / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~".
const RFC5987_ATTR_CHAR = /^[A-Za-z0-9!#$&+\-.^_`|~]$/;
const utf8Encoder = new TextEncoder();

/**
 * Encodes a value for the RFC 5987 `filename*` parameter. Every UTF-8 byte outside attr-char is
 * percent-encoded, including ' ( ) * which encodeURIComponent leaves unescaped. A lone surrogate is
 * encoded as U+FFFD instead of throwing.
 */
export function encodeRfc5987Value(value: string): string {
  let encoded = "";
  for (const byte of utf8Encoder.encode(value)) {
    const character = String.fromCharCode(byte);
    encoded +=
      byte < 0x80 && RFC5987_ATTR_CHAR.test(character)
        ? character
        : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return encoded;
}

// One header builder for every file response: an ASCII fallback plus the RFC 5987 UTF-8 name.
export function buildContentDisposition(type: ContentDispositionType, filename: string): string {
  return `${type}; filename="${sanitizeFilename(filename)}"; filename*=UTF-8''${encodeRfc5987Value(filename)}`;
}
