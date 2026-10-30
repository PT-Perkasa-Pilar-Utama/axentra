import { describe, expect, test } from "bun:test";
import { buildContentDisposition, encodeRfc5987Value } from "./content-disposition";

const ENCODED_VALUE = /^(?:[A-Za-z0-9!#$&+\-.^_`|~]|%[0-9A-F]{2})*$/;

describe("encodeRfc5987Value (Round 1 F35)", () => {
  test("keeps every RFC 5987 attr-char unescaped", () => {
    const attrChars = "AZaz09!#$&+-.^_`|~";

    expect(encodeRfc5987Value(attrChars)).toBe(attrChars);
  });

  test("percent-encodes ' ( ) * that encodeURIComponent leaves unescaped", () => {
    expect(encodeRfc5987Value("'()*")).toBe("%27%28%29%2A");
  });

  test("percent-encodes separators, quotes, and the percent sign", () => {
    expect(encodeRfc5987Value(' "%;,/\\=?@:<>[]{}')).toBe(
      "%20%22%25%3B%2C%2F%5C%3D%3F%40%3A%3C%3E%5B%5D%7B%7D",
    );
  });

  test("percent-encodes control characters", () => {
    expect(encodeRfc5987Value("a\nb\r\u0000\u007f")).toBe("a%0Ab%0D%00%7F");
  });

  test("encodes non-ASCII text as uppercase UTF-8 percent sequences", () => {
    expect(encodeRfc5987Value("é")).toBe("%C3%A9");
    expect(encodeRfc5987Value("日本")).toBe("%E6%97%A5%E6%9C%AC");
    expect(encodeRfc5987Value("📄")).toBe("%F0%9F%93%84");
  });

  test("encodes a lone surrogate as U+FFFD instead of throwing", () => {
    expect(encodeRfc5987Value("a\uD800b")).toBe("a%EF%BF%BDb");
  });

  test("produces only attr-char or %XX and decodes back to the original name", () => {
    const filename = "Laporan Keuangan (Final) 100% 'v2' * é.pdf";

    const encoded = encodeRfc5987Value(filename);

    expect(encoded).toMatch(ENCODED_VALUE);
    expect(decodeURIComponent(encoded)).toBe(filename);
  });
});

describe("buildContentDisposition (Round 1 F35)", () => {
  test("builds an attachment header with an ASCII fallback and the encoded UTF-8 name", () => {
    expect(buildContentDisposition("attachment", "laporan (final).pdf")).toBe(
      `attachment; filename="laporan__final_.pdf"; filename*=UTF-8''laporan%20%28final%29.pdf`,
    );
  });

  test("builds an inline header for preview content", () => {
    expect(buildContentDisposition("inline", "laporan.pdf")).toBe(
      `inline; filename="laporan.pdf"; filename*=UTF-8''laporan.pdf`,
    );
  });
});
