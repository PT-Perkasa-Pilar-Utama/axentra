import { describe, expect, it } from "bun:test";
import { generateSnippet, resolveDocumentSnippet, splitSnippetIntoSegments } from "./snippet";

describe("generateSnippet unit tests", () => {
  it("returns null when query is undefined, null, or empty string without fallback", () => {
    expect(generateSnippet("Some text content", undefined)).toBeNull();
    expect(generateSnippet("Some text content", null)).toBeNull();
    expect(generateSnippet("Some text content", "")).toBeNull();
    expect(generateSnippet("Some text content", "   ")).toBeNull();
  });

  it("returns null when sourceText is undefined, null, or empty string", () => {
    expect(generateSnippet(undefined, "API")).toBeNull();
    expect(generateSnippet(null, "API")).toBeNull();
    expect(generateSnippet("", "API")).toBeNull();
    expect(generateSnippet("   ", "API")).toBeNull();
  });

  it("returns null when query does not match sourceText without fallback", () => {
    expect(generateSnippet("Laporan keuangan tahun 2026", "API")).toBeNull();
  });

  it("extracts matching keyword as plain text and provides accurate highlights (F3)", () => {
    const text = "Dokumen ini menjelaskan integrasi REST API untuk manajemen data.";
    const result = generateSnippet(text, "API");

    expect(result).not.toBeNull();
    expect(result?.snippet).toBe(
      "Dokumen ini menjelaskan integrasi REST API untuk manajemen data.",
    );
    // Plain text: NO literal HTML tags in snippet
    expect(result?.snippet).not.toContain("<strong>");
    expect(result?.snippet).not.toContain("</strong>");

    // Highlights precisely locate "API"
    expect(result?.highlights).toHaveLength(1);
    const hl1 = result?.highlights[0];
    expect(hl1).toBeDefined();
    if (hl1 && result) {
      expect(result.snippet.slice(hl1.start, hl1.end)).toBe("API");
    }
  });

  it("preserves original casing of matched text in plain text snippet and highlights", () => {
    const text = "Dokumen arsitektur Rest Api perkasa.";
    const result = generateSnippet(text, "api");

    expect(result).not.toBeNull();
    expect(result?.snippet).toBe("Dokumen arsitektur Rest Api perkasa.");
    const hl2 = result?.highlights[0];
    expect(hl2).toBeDefined();
    if (hl2 && result) {
      expect(result.snippet.slice(hl2.start, hl2.end)).toBe("Api");
    }
  });

  it("adds ellipsis prefix and suffix when text exceeds context window", () => {
    const longText =
      "Awalan dokumen yang sangat panjang dan memuat banyak kata pengantar sebelum sampai pada pokok bahasan utama mengenai spesifikasi API yang dirancang untuk platform dan diakhiri dengan kesimpulan yang juga sangat panjang sekali.";

    const result = generateSnippet(longText, "API", { contextRadius: 20 });

    expect(result).not.toBeNull();
    expect(result?.snippet.startsWith("...")).toBe(true);
    expect(result?.snippet.endsWith("...")).toBe(true);

    const hl3 = result?.highlights[0];
    expect(hl3).toBeDefined();
    if (hl3 && result) {
      expect(result.snippet.slice(hl3.start, hl3.end)).toBe("API");
    }
  });

  it("preserves special characters as plain text without entity encoding (F3)", () => {
    const textWithSymbols = 'Teks <script>alert("xss")</script> API sistem.';
    const result = generateSnippet(textWithSymbols, "API");

    expect(result).not.toBeNull();
    // Plain text is preserved, not entity-encoded
    expect(result?.snippet).toContain('<script>alert("xss")</script>');
    expect(result?.snippet).not.toContain("&lt;script&gt;");

    const hl4 = result?.highlights[0];
    expect(hl4).toBeDefined();
    if (hl4 && result) {
      expect(result.snippet.slice(hl4.start, hl4.end)).toBe("API");
    }
  });

  it("normalizes newlines and tabs to single spaces", () => {
    const multilineText = "Baris pertama\n\n\tBaris kedua memuat kata API\r\ndan baris ketiga";
    const result = generateSnippet(multilineText, "API");

    expect(result).not.toBeNull();
    expect(result?.snippet).not.toContain("\n");
    expect(result?.snippet).not.toContain("\t");
    const hl5 = result?.highlights[0];
    expect(hl5).toBeDefined();
    if (hl5 && result) {
      expect(result.snippet.slice(hl5.start, hl5.end)).toBe("API");
    }
  });
});

describe("splitSnippetIntoSegments unit tests (F3 / React highlight safety)", () => {
  it("splits snippet into match and non-match segments for React rendering", () => {
    const snippet = "...sebelum integrasi API sistem...";
    const startIdx = snippet.indexOf("API");
    const highlights = [{ start: startIdx, end: startIdx + "API".length }];

    const segments = splitSnippetIntoSegments(snippet, highlights);

    expect(segments).toEqual([
      { text: "...sebelum integrasi ", isMatch: false },
      { text: "API", isMatch: true },
      { text: " sistem...", isMatch: false },
    ]);

    // Consumer can render safely as React elements:
    // segments.map(s => s.isMatch ? <strong>{s.text}</strong> : s.text)
    const simulatedReactHtml = segments
      .map((s) => (s.isMatch ? `<strong>${s.text}</strong>` : s.text))
      .join("");
    expect(simulatedReactHtml).toBe("...sebelum integrasi <strong>API</strong> sistem...");
  });

  it("returns single segment when highlights is empty", () => {
    const segments = splitSnippetIntoSegments("Teks tanpa highlight", []);
    expect(segments).toEqual([{ text: "Teks tanpa highlight", isMatch: false }]);
  });
});

describe("resolveDocumentSnippet unit tests (F1 / Multi-field snippet)", () => {
  it("resolves snippet from extractedText when content matches (content match)", () => {
    const result = resolveDocumentSnippet("keuangan", {
      title: "Laporan Tahunan",
      originalName: "dokumen.pdf",
      extractedText: "Isi dokumen mencakup analisis keuangan kuartal 4.",
    });

    expect(result.snippet).toContain("keuangan");
    expect(result.highlights.length).toBeGreaterThan(0);
    const hl6 = result.highlights[0];
    expect(hl6).toBeDefined();
    if (hl6 && result.snippet) {
      expect(result.snippet.slice(hl6.start, hl6.end)).toBe("keuangan");
    }
  });

  it("resolves snippet from title when only title matches (title-only match)", () => {
    const result = resolveDocumentSnippet("anggaran", {
      title: "Laporan Anggaran 2026",
      originalName: "dokumen.pdf",
      extractedText: "Isi dokumen hanya membahas operasional umum.",
    });

    expect(result.snippet).not.toBeNull();
    expect(result.snippet).toContain("Anggaran");
    expect(result.highlights.length).toBeGreaterThan(0);
    const hl7 = result.highlights[0];
    expect(hl7).toBeDefined();
    if (hl7 && result.snippet) {
      expect(result.snippet.slice(hl7.start, hl7.end)).toBe("Anggaran");
    }
  });

  it("resolves snippet from filename when only filename matches (filename-only match)", () => {
    const result = resolveDocumentSnippet("invoice", {
      title: "Berkas Pengeluaran",
      originalName: "invoice-perusahaan-2026.pdf",
      extractedText: "Isi dokumen hanya teks acak tanpa kata kunci.",
    });

    expect(result.snippet).not.toBeNull();
    expect(result.snippet).toContain("invoice");
    expect(result.highlights.length).toBeGreaterThan(0);
    const hl8 = result.highlights[0];
    expect(hl8).toBeDefined();
    if (hl8 && result.snippet) {
      expect(result.snippet.slice(hl8.start, hl8.end)).toBe("invoice");
    }
  });

  it("returns fallback snippet with non-null text when query does not appear in candidate fields", () => {
    const result = resolveDocumentSnippet("nonexistent", {
      title: "Judul Dokumen",
      originalName: "file.pdf",
      extractedText: "Konten dokumen tersedia di sini.",
    });

    expect(result.snippet).toBeTruthy();
    expect(result.snippet?.length).toBeGreaterThan(0);
    expect(result.highlights).toHaveLength(0);
  });
});
