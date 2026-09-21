import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CD_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const MAX_CORE_XML_BYTES = 512 * 1024; // 512 KiB safety bound against zip bombs
const MAX_CENTRAL_DIRECTORY_ENTRIES = 500;

function cleanAuthorString(raw: string): string | null {
  const unescaped = raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  const cleaned = unescaped
    .replace(/[\0\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length === 0 || cleaned.length > 255) {
    return null;
  }
  return cleaned;
}

function extractCreatorFromXml(xml: string): string | null {
  const creatorMatch = xml.match(/<dc:creator(?:[^>]*)>([^<]+)<\/dc:creator>/i);
  if (creatorMatch?.[1]) {
    const cleaned = cleanAuthorString(creatorMatch[1]);
    if (cleaned) return cleaned;
  }

  const lastModifiedMatch = xml.match(/<cp:lastModifiedBy(?:[^>]*)>([^<]+)<\/cp:lastModifiedBy>/i);
  if (lastModifiedMatch?.[1]) {
    const cleaned = cleanAuthorString(lastModifiedMatch[1]);
    if (cleaned) return cleaned;
  }

  return null;
}

/**
 * Traverses a ZIP archive's central directory to locate `docProps/core.xml`,
 * safely decompresses the entry (supporting stored and raw DEFLATE compression),
 * and parses author/creator metadata.
 */
export function extractAuthorFromDocxBuffer(buffer: Uint8Array): string | null {
  if (buffer.length < 22) return null;

  // 1. Locate End of Central Directory record (EOCD) by scanning backwards
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

  if (eocdOffset === -1) return null;

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(eocdOffset, true) !== EOCD_SIGNATURE) {
    return null;
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  if (cdOffset + cdSize > buffer.length) return null;

  // 2. Iterate Central Directory headers to find docProps/core.xml
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
      // Guard against zip bombs or corrupted sizes
      if (uncompressedSize > MAX_CORE_XML_BYTES) return null;
      if (localHeaderOffset + 30 > buffer.length) return null;

      const localSig = view.getUint32(localHeaderOffset, true);
      if (localSig !== LOCAL_HEADER_SIGNATURE) return null;

      const localFilenameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataOffset = localHeaderOffset + 30 + localFilenameLen + localExtraLen;

      if (dataOffset + compressedSize > buffer.length) return null;

      let xmlText = "";
      if (compressionMethod === 0) {
        // Stored (uncompressed)
        xmlText = Buffer.from(buffer.subarray(dataOffset, dataOffset + compressedSize)).toString(
          "utf-8",
        );
      } else if (compressionMethod === 8) {
        // Deflated (standard OOXML)
        const compressedChunk = buffer.subarray(dataOffset, dataOffset + compressedSize);
        try {
          const decompressed = inflateRawSync(compressedChunk, {
            maxOutputLength: MAX_CORE_XML_BYTES,
          });
          xmlText = decompressed.toString("utf-8");
        } catch {
          return null;
        }
      } else {
        return null;
      }

      return extractCreatorFromXml(xmlText);
    }

    offset += 46 + filenameLen + extraLen + commentLen;
  }

  return null;
}
