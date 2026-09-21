/**
 * Metadata Extractor Interface & Deterministic Placeholder Extractor
 *
 * Implements Task BE-S1-05 requirements per docs/technical-specs/10-integration-points.md
 * and docs/GLOSSARY.md. Provides predictable extraction behind the planned provider interface
 * until production OCR/AI engine is approved.
 */

export type ExtractorInput = {
  documentId: string;
  filename: string;
  mimeType?: string | undefined;
  buffer?: Uint8Array | Buffer | undefined;
  rawText?: string | undefined;
};

export type ExtractedMetadata = {
  author: string | null;
  rawMetadata: Record<string, unknown>;
  extractedAt: Date;
};

export type IMetadataExtractor = {
  extract: (input: ExtractorInput) => Promise<ExtractedMetadata> | ExtractedMetadata;
};

export type DeterministicExtractorOptions = {
  defaultAuthor?: string | null | undefined;
  authorOverrides?: Record<string, string> | undefined;
};

function cleanAuthorString(raw: string): string | null {
  const cleaned = raw
    .replace(/[\0\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0 || cleaned.length > 255) {
    return null;
  }
  return cleaned;
}

function extractFromText(text: string): string | null {
  // Common patterns: "Penulis: Ahmad Yani", "Author: Jane Doe", "Created by: Budi"
  const patterns = [
    /(?:penulis|author|creator|created\s+by)\s*[:=-]\s*([^\r\n,;]{2,100})/i,
    /(?:by|oleh)\s*[:=-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = match?.[1];
    if (candidate) {
      const cleaned = cleanAuthorString(candidate);
      if (cleaned) return cleaned;
    }
  }

  return null;
}

function extractFromPdfBuffer(buffer: Uint8Array): string | null {
  // Convert printable slice of buffer to ascii string for regex matching
  // Metadata is typically in the first 4KB or last 4KB of PDF
  const headLength = Math.min(buffer.length, 8192);
  const headText = Buffer.from(buffer.subarray(0, headLength)).toString("latin1");

  // Check /Author (Author Name) in PDF Info dictionary
  const authorMatch = headText.match(/\/Author\s*\(([^)\\]*(?:\\.[^)\\]*)*)\)/);
  if (authorMatch?.[1]) {
    const unescaped = authorMatch[1].replace(/\\([()\\])/g, "$1");
    const cleaned = cleanAuthorString(unescaped);
    if (cleaned) return cleaned;
  }

  // Check /Author <hex> in PDF Info dictionary
  const hexAuthorMatch = headText.match(/\/Author\s*<([0-9a-fA-F]+)>/);
  if (hexAuthorMatch?.[1]) {
    try {
      const decoded = Buffer.from(hexAuthorMatch[1], "hex").toString("utf-8");
      const cleaned = cleanAuthorString(decoded);
      if (cleaned) return cleaned;
    } catch {
      // ignore hex decode error
    }
  }

  // Also check tail if not found in head (for linearized/incremental PDFs)
  if (buffer.length > 8192) {
    const tailStart = Math.max(0, buffer.length - 8192);
    const tailText = Buffer.from(buffer.subarray(tailStart)).toString("latin1");
    const tailAuthorMatch = tailText.match(/\/Author\s*\(([^)\\]*(?:\\.[^)\\]*)*)\)/);
    if (tailAuthorMatch?.[1]) {
      const unescaped = tailAuthorMatch[1].replace(/\\([()\\])/g, "$1");
      const cleaned = cleanAuthorString(unescaped);
      if (cleaned) return cleaned;
    }
  }

  // Fallback to text patterns in PDF stream if present
  return extractFromText(headText);
}

function extractFromDocxBuffer(buffer: Uint8Array): string | null {
  // DOCX contains XML files inside a ZIP container.
  // docProps/core.xml typically contains <dc:creator>Author Name</dc:creator>
  // In many cases, the uncompressed string is visible in the raw buffer or XML stream
  const maxSearchLength = Math.min(buffer.length, 65536);
  const sample = Buffer.from(buffer.subarray(0, maxSearchLength)).toString("latin1");

  const creatorMatch = sample.match(/<dc:creator(?:[^>]*)>([^<]+)<\/dc:creator>/i);
  if (creatorMatch?.[1]) {
    const cleaned = cleanAuthorString(creatorMatch[1]);
    if (cleaned) return cleaned;
  }

  const lastModifiedMatch = sample.match(
    /<cp:lastModifiedBy(?:[^>]*)>([^<]+)<\/cp:lastModifiedBy>/i,
  );
  if (lastModifiedMatch?.[1]) {
    const cleaned = cleanAuthorString(lastModifiedMatch[1]);
    if (cleaned) return cleaned;
  }

  return extractFromText(sample);
}

function extractFromFilename(filename: string): string | null {
  // e.g. "laporan-keuangan-by-ahmad-yani.pdf" or "audit-penulis-budi-santoso.docx"
  const baseName = filename.replace(/\.[^/.]+$/, "");
  const match = baseName.match(/(?:[-_]by[-_]|[-_]penulis[-_]|[-_]author[-_])([a-zA-Z0-9-_]+)$/i);
  if (match?.[1]) {
    const words = match[1].replace(/[-_]+/g, " ").trim();
    if (words.length > 0) {
      // Capitalize words
      const capitalized = words
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
      return cleanAuthorString(capitalized);
    }
  }
  return null;
}

export class DeterministicMetadataExtractor implements IMetadataExtractor {
  public constructor(private readonly options: DeterministicExtractorOptions = {}) {}

  public extract(input: ExtractorInput): ExtractedMetadata {
    const extractedAt = new Date();

    // 1. Check explicit override by documentId or filename
    if (this.options.authorOverrides) {
      const override =
        this.options.authorOverrides[input.documentId] ??
        this.options.authorOverrides[input.filename];
      if (override !== undefined) {
        return {
          author: override,
          rawMetadata: {
            extractor: "deterministic-placeholder",
            method: "override",
            source: "options.authorOverrides",
          },
          extractedAt,
        };
      }
    }

    // 2. Check explicit rawText if passed
    if (input.rawText) {
      const textAuthor = extractFromText(input.rawText);
      if (textAuthor) {
        return {
          author: textAuthor,
          rawMetadata: {
            extractor: "deterministic-placeholder",
            method: "text_pattern",
            source: "rawText",
          },
          extractedAt,
        };
      }
    }

    // 3. Inspect file buffer if present
    if (input.buffer && input.buffer.length > 0) {
      const isPdf =
        input.mimeType === "application/pdf" ||
        input.filename.toLowerCase().endsWith(".pdf") ||
        (input.buffer.length >= 4 &&
          input.buffer[0] === 0x25 &&
          input.buffer[1] === 0x50 &&
          input.buffer[2] === 0x44 &&
          input.buffer[3] === 0x46);

      if (isPdf) {
        const pdfAuthor = extractFromPdfBuffer(input.buffer);
        if (pdfAuthor) {
          return {
            author: pdfAuthor,
            rawMetadata: {
              extractor: "deterministic-placeholder",
              method: "pdf_info_dict",
              source: "buffer",
            },
            extractedAt,
          };
        }
      }

      const isDocx =
        input.mimeType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        input.filename.toLowerCase().endsWith(".docx") ||
        (input.buffer.length >= 4 &&
          input.buffer[0] === 0x50 &&
          input.buffer[1] === 0x4b &&
          input.buffer[2] === 0x03 &&
          input.buffer[3] === 0x04);

      if (isDocx) {
        const docxAuthor = extractFromDocxBuffer(input.buffer);
        if (docxAuthor) {
          return {
            author: docxAuthor,
            rawMetadata: {
              extractor: "deterministic-placeholder",
              method: "docx_xml_core",
              source: "buffer",
            },
            extractedAt,
          };
        }
      }
    }

    // 4. Inspect filename pattern
    const filenameAuthor = extractFromFilename(input.filename);
    if (filenameAuthor) {
      return {
        author: filenameAuthor,
        rawMetadata: {
          extractor: "deterministic-placeholder",
          method: "filename_pattern",
          source: input.filename,
        },
        extractedAt,
      };
    }

    // 5. Default author fallback (if configured) or null
    const finalAuthor = this.options.defaultAuthor ?? null;
    return {
      author: finalAuthor,
      rawMetadata: {
        extractor: "deterministic-placeholder",
        method: finalAuthor ? "default_fallback" : "none",
        detected: false,
      },
      extractedAt,
    };
  }
}
