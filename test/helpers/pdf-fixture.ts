/**
 * Conforming PDF fixture generator for integration and unit testing.
 *
 * Implements Adobe PDF Reference (1.4 / 1.6) specification Section 3.4:
 * - Proper %PDF header
 * - Catalog, Pages, Page, and Content stream objects with exact byte offsets
 * - Strict 20-byte cross-reference (xref) entries (Section 3.4.3):
 *   10-digit offset + 1 space + 5-digit generation + 1 space + 'n'/'f' + 1 space + '\n' = 20 bytes
 * - Computed startxref pointer matching the exact xref table offset
 * - Conforming trailer dictionary and EOF marker
 *
 * Avoids raw multiline template trailing whitespace in source code files (Finding F16).
 */

export type ConformingPdfOptions = {
  author?: string;
  title?: string;
  bodyText: string;
};

export function buildConformingPdf(options: ConformingPdfOptions): string {
  const chunks: string[] = [];
  const offsets: number[] = [0];

  const header = "%PDF-1.4\n";
  chunks.push(header);
  let currentOffset = Buffer.byteLength(header, "utf-8");

  // Obj 1: Catalog
  const obj1 = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  offsets.push(currentOffset);
  chunks.push(obj1);
  currentOffset += Buffer.byteLength(obj1, "utf-8");

  // Obj 2: Pages
  const obj2 = "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n";
  offsets.push(currentOffset);
  chunks.push(obj2);
  currentOffset += Buffer.byteLength(obj2, "utf-8");

  // Obj 3: Page
  const obj3 =
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n";
  offsets.push(currentOffset);
  chunks.push(obj3);
  currentOffset += Buffer.byteLength(obj3, "utf-8");

  // Obj 4: Contents (Stream with body text)
  const escapedText = options.bodyText.replace(/[()\\]/g, "\\$&");
  const streamContent = `BT\n/F1 12 Tf\n72 712 Td\n(${escapedText}) Tj\nET`;
  const streamLength = Buffer.byteLength(streamContent, "utf-8");
  const obj4 = `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj\n`;
  offsets.push(currentOffset);
  chunks.push(obj4);
  currentOffset += Buffer.byteLength(obj4, "utf-8");

  // Obj 5: Document Metadata / Info (optional)
  let infoObjNum: number | undefined;
  if (options.author || options.title) {
    infoObjNum = 5;
    const infoParts: string[] = [];
    if (options.author) {
      const escapedAuthor = options.author.replace(/[()\\]/g, "\\$&");
      infoParts.push(`/Author (${escapedAuthor})`);
    }
    if (options.title) {
      const escapedTitle = options.title.replace(/[()\\]/g, "\\$&");
      infoParts.push(`/Title (${escapedTitle})`);
    }
    const obj5 = `5 0 obj\n<< ${infoParts.join(" ")} >>\nendobj\n`;
    offsets.push(currentOffset);
    chunks.push(obj5);
    currentOffset += Buffer.byteLength(obj5, "utf-8");
  }

  // Cross-reference table
  const startXrefOffset = currentOffset;
  const xrefHeader = `xref\n0 ${offsets.length}\n`;
  chunks.push(xrefHeader);
  currentOffset += Buffer.byteLength(xrefHeader, "utf-8");

  // Object 0 (free entry): exactly 20 bytes including end-of-line marker
  // 10 chars offset + 1 space + 5 chars gen + 1 space + 'f' + 1 space + '\n' = 20 bytes
  const entry0 = "0000000000 65535 f \n";
  chunks.push(entry0);
  currentOffset += Buffer.byteLength(entry0, "utf-8");

  // Objects 1..N (in-use entries): exactly 20 bytes each
  for (let i = 1; i < offsets.length; i++) {
    const offStr = String(offsets[i]).padStart(10, "0");
    const entry = `${offStr} 00000 n \n`;
    chunks.push(entry);
    currentOffset += Buffer.byteLength(entry, "utf-8");
  }

  // Trailer dictionary & EOF
  const trailerDict = `<< /Size ${offsets.length} /Root 1 0 R${
    infoObjNum ? ` /Info ${infoObjNum} 0 R` : ""
  } >>`;
  const trailer = `trailer\n${trailerDict}\nstartxref\n${startXrefOffset}\n%%EOF\n`;
  chunks.push(trailer);

  return chunks.join("");
}

export type ValidatedPdfMetadata = {
  author?: string | undefined;
  title?: string | undefined;
};

export type ValidatedPdfResult = {
  objectCount: number;
  startXrefOffset: number;
  info?: ValidatedPdfMetadata | undefined;
};

/**
 * Strict parser validation for conforming PDF cross-reference structure per Adobe PDF Reference.
 * Validates %PDF-1.4 header, anchored %%EOF terminator, 20-byte record sizing, object header
 * offsets, trailer dictionary (/Size, /Root, /Info), and document metadata (Finding F17).
 */
export function validateConformingPdf(pdfContent: string | Uint8Array): ValidatedPdfResult {
  const buf =
    typeof pdfContent === "string" ? Buffer.from(pdfContent, "utf-8") : Buffer.from(pdfContent);

  // 1. Strict header check: must begin with %PDF-1.4 (Finding F17 & F20)
  const headerStr = buf.subarray(0, 10).toString("utf-8");
  if (!headerStr.startsWith("%PDF-1.4\n") && !headerStr.startsWith("%PDF-1.4\r\n")) {
    throw new Error(
      `Invalid PDF header: expected '%PDF-1.4', got '${headerStr.slice(0, 10).trim()}'`,
    );
  }

  // 2. Strict EOF check: startxref and %%EOF must be anchored to the end of the file (Finding F17 & F20)
  const eofMarker = Buffer.from("%%EOF");
  const lastEofIndex = buf.lastIndexOf(eofMarker);
  if (lastEofIndex === -1) {
    throw new Error("Missing or malformed startxref / %%EOF (must terminate at end of file)");
  }

  const trailingBytes = buf.subarray(lastEofIndex + eofMarker.length);
  const trailingStr = trailingBytes.toString("utf-8");
  if (trailingStr !== "" && trailingStr !== "\n" && trailingStr !== "\r\n") {
    throw new Error("File contains unexpected trailing bytes after %%EOF marker");
  }

  // Parse startxref offset preceding %%EOF using byte-level tail slicing
  const tailStart = Math.max(0, lastEofIndex - 256);
  const tailRegion = buf.subarray(tailStart, lastEofIndex + eofMarker.length).toString("utf-8");
  const eofMatch = tailRegion.match(/startxref\r?\n(\d+)\r?\n%%EOF$/);
  if (!eofMatch || eofMatch[1] === undefined) {
    throw new Error("Missing or malformed startxref / %%EOF (must terminate at end of file)");
  }

  const startXref = parseInt(eofMatch[1], 10);
  if (Number.isNaN(startXref) || startXref <= 0 || startXref >= buf.length) {
    throw new Error(`Invalid startxref offset: ${startXref}`);
  }

  const xrefHeader = buf.subarray(startXref, startXref + 5).toString("utf-8");
  if (xrefHeader !== "xref\n" && xrefHeader !== "xref\r\n") {
    throw new Error(`Expected 'xref\\n' at offset ${startXref}, got '${xrefHeader}'`);
  }

  const xrefSection = buf.subarray(startXref).toString("utf-8");
  const countMatch = xrefSection.match(/^xref\r?\n0 (\d+)\r?\n/);
  if (!countMatch || countMatch[1] === undefined) {
    throw new Error("Missing or malformed xref subsection '0 <count>'");
  }

  const count = parseInt(countMatch[1], 10);
  const headerMatch = xrefSection.match(/^xref\r?\n0 \d+\r?\n/);
  const headerLen = headerMatch ? Buffer.byteLength(headerMatch[0], "utf-8") : 0;
  const entriesStart = startXref + headerLen;

  const objectOffsets = new Map<number, number>();

  for (let i = 0; i < count; i++) {
    const entryStart = entriesStart + i * 20;
    const entryBytes = buf.subarray(entryStart, entryStart + 20);
    if (entryBytes.length !== 20) {
      throw new Error(`Xref entry ${i} must be exactly 20 bytes (got ${entryBytes.length})`);
    }

    const entryStr = entryBytes.toString("utf-8");
    const parsed = entryStr.match(/^(\d{10}) (\d{5}) (n|f) \r?\n$/);
    if (!parsed || parsed[1] === undefined || parsed[2] === undefined || parsed[3] === undefined) {
      throw new Error(`Xref entry ${i} has invalid format: ${JSON.stringify(entryStr)}`);
    }

    if (i === 0) {
      if (parsed[1] !== "0000000000" || parsed[2] !== "65535" || parsed[3] !== "f") {
        throw new Error(`Entry 0 must be 0000000000 65535 f, got ${entryStr}`);
      }
    } else {
      if (parsed[3] !== "n") {
        throw new Error(`Object entry ${i} must be in-use ('n'), got ${entryStr}`);
      }
      const targetOffset = parseInt(parsed[1], 10);
      objectOffsets.set(i, targetOffset);
      const targetHeader = buf.subarray(targetOffset, targetOffset + 12).toString("utf-8");
      if (!targetHeader.startsWith(`${i} 0 obj`)) {
        throw new Error(
          `Object ${i} expected at offset ${targetOffset}, found: ${JSON.stringify(targetHeader)}`,
        );
      }
    }
  }

  // 3. Trailer dictionary inspection & metadata verification (Finding F17 & F20)
  const trailerRegion = buf.subarray(entriesStart + count * 20).toString("utf-8");
  const trailerMatch = trailerRegion.match(/trailer\r?\n<<([\s\S]*?)>>\r?\nstartxref/);
  if (!trailerMatch || trailerMatch[1] === undefined) {
    throw new Error("Missing or malformed trailer dictionary between xref table and startxref");
  }

  const trailerContent = trailerMatch[1];

  // Validate /Size in trailer
  const sizeMatch = trailerContent.match(/\/Size\s+(\d+)/);
  if (!sizeMatch || sizeMatch[1] === undefined) {
    throw new Error("Trailer dictionary missing required /Size entry");
  }
  const trailerSize = parseInt(sizeMatch[1], 10);
  if (trailerSize !== count) {
    throw new Error(`Trailer /Size (${trailerSize}) does not match xref count (${count})`);
  }

  // Validate /Root in trailer
  const rootMatch = trailerContent.match(/\/Root\s+(\d+)\s+0\s+R/);
  if (!rootMatch || rootMatch[1] === undefined) {
    throw new Error("Trailer dictionary missing required /Root entry");
  }
  const rootObjNum = parseInt(rootMatch[1], 10);
  if (!objectOffsets.has(rootObjNum)) {
    throw new Error(`Trailer /Root points to non-existent object ${rootObjNum}`);
  }

  // Inspect optional /Info metadata object in trailer (Finding F17 & F20)
  let infoMetadata: ValidatedPdfMetadata | undefined;
  const infoMatch = trailerContent.match(/\/Info\s+(\d+)\s+0\s+R/);
  if (infoMatch && infoMatch[1] !== undefined) {
    const infoObjNum = parseInt(infoMatch[1], 10);
    const infoOffset = objectOffsets.get(infoObjNum);
    if (infoOffset === undefined) {
      throw new Error(`Trailer /Info references object ${infoObjNum} which is not in xref table`);
    }

    const objSlice = buf
      .subarray(infoOffset, Math.min(buf.length, infoOffset + 1024))
      .toString("utf-8");
    const infoObjMatch = objSlice.match(
      new RegExp(`^${infoObjNum} 0 obj\\r?\\n<<([\\s\\S]*?)>>\\r?\\nendobj`),
    );
    if (!infoObjMatch || infoObjMatch[1] === undefined) {
      throw new Error(`Malformed metadata Info object ${infoObjNum} at offset ${infoOffset}`);
    }

    const infoDictContent = infoObjMatch[1];
    const authorMatch = infoDictContent.match(/\/Author\s+\((.*?)\)/);
    const titleMatch = infoDictContent.match(/\/Title\s+\((.*?)\)/);

    infoMetadata = {
      author: authorMatch?.[1] ? authorMatch[1].replace(/\\([()\\])/g, "$1") : undefined,
      title: titleMatch?.[1] ? titleMatch[1].replace(/\\([()\\])/g, "$1") : undefined,
    };
  }

  return { objectCount: count, startXrefOffset: startXref, info: infoMetadata };
}
