// Teks pratinjau DOCX tanpa dependensi baru. DOCX adalah arsip zip berisi XML; hanya
// word/document.xml yang dibaca. Zip dibaca dari central directory (bukan dari header lokal berurutan)
// karena entri yang dibutuhkan bisa berada di mana saja di dalam arsip.
// Hanya teks paragraf yang diambil: tata letak, gambar, dan tabel tidak ditampilkan.

export const DOCX_MAX_PREVIEW_CHARS = 200_000;

// Batas ukuran hasil dekompresi word/document.xml, melindungi dari arsip zip-bomb.
const MAX_DOCUMENT_XML_BYTES = 32 * 1024 * 1024;
const DOCUMENT_XML_PATH = "word/document.xml";
const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const EOCD_SIZE = 22;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const MAX_ZIP_COMMENT_BYTES = 0xffff;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const FLAG_ENCRYPTED = 0x1;

export type DocxPreviewText = {
  /** Paragraf yang tidak kosong, sudah dipangkas dan dibatasi DOCX_MAX_PREVIEW_CHARS. */
  paragraphs: string[];
  truncated: boolean;
};

/** Galat arsip atau XML. Pesannya untuk pengembang; UI hanya menampilkan status galat. */
export class DocxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocxParseError";
  }
}

type ZipEntry = {
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

function requireRange(length: number, offset: number, size: number): void {
  if (offset < 0 || size < 0 || offset + size > length) {
    throw new DocxParseError("Arsip DOCX rusak: data di luar batas");
  }
}

function findEndOfCentralDirectory(view: DataView): number {
  if (view.byteLength < EOCD_SIZE) {
    throw new DocxParseError("Arsip DOCX terlalu kecil");
  }
  // Record EOCD berada di akhir arsip, diikuti komentar berukuran hingga 65535 byte.
  const lowest = Math.max(0, view.byteLength - EOCD_SIZE - MAX_ZIP_COMMENT_BYTES);
  for (let offset = view.byteLength - EOCD_SIZE; offset >= lowest; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  throw new DocxParseError("Arsip DOCX tidak valid: central directory tidak ditemukan");
}

function decodeName(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function findDocumentXmlEntry(bytes: Uint8Array, view: DataView): ZipEntry {
  const eocd = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (entryCount === 0xffff || offset === 0xffffffff) {
    throw new DocxParseError("Arsip DOCX memakai zip64 yang tidak didukung");
  }

  for (let index = 0; index < entryCount; index += 1) {
    requireRange(view.byteLength, offset, CENTRAL_HEADER_SIZE);
    if (view.getUint32(offset, true) !== CENTRAL_HEADER_SIGNATURE) {
      throw new DocxParseError("Arsip DOCX rusak: header central directory tidak valid");
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + CENTRAL_HEADER_SIZE;
    requireRange(view.byteLength, nameStart, nameLength);

    if (decodeName(bytes.subarray(nameStart, nameStart + nameLength)) === DOCUMENT_XML_PATH) {
      return {
        flags: view.getUint16(offset + 8, true),
        method: view.getUint16(offset + 10, true),
        compressedSize: view.getUint32(offset + 20, true),
        uncompressedSize: view.getUint32(offset + 24, true),
        localOffset: view.getUint32(offset + 42, true),
      };
    }
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  throw new DocxParseError("word/document.xml tidak ditemukan di dalam arsip DOCX");
}

function assertReadable(entry: ZipEntry): void {
  if (entry.method !== METHOD_STORED && entry.method !== METHOD_DEFLATE) {
    throw new DocxParseError(`Metode kompresi ${entry.method} tidak didukung`);
  }
  if ((entry.flags & FLAG_ENCRYPTED) !== 0) {
    throw new DocxParseError("Entri terenkripsi tidak didukung");
  }
  if (entry.uncompressedSize > MAX_DOCUMENT_XML_BYTES) {
    throw new DocxParseError("word/document.xml melebihi batas ukuran pratinjau");
  }
}

// Data terkompresi dibaca dari header lokal, karena panjang nama dan extra field di sana bisa berbeda
// dari central directory.
function readEntryData(bytes: Uint8Array, view: DataView, entry: ZipEntry): Uint8Array {
  requireRange(view.byteLength, entry.localOffset, LOCAL_HEADER_SIZE);
  if (view.getUint32(entry.localOffset, true) !== LOCAL_HEADER_SIGNATURE) {
    throw new DocxParseError("Arsip DOCX rusak: header lokal tidak valid");
  }
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + LOCAL_HEADER_SIZE + nameLength + extraLength;
  requireRange(view.byteLength, start, entry.compressedSize);
  return bytes.subarray(start, start + entry.compressedSize);
}

async function readLimited(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let result = await reader.read();
  while (!result.done) {
    total += result.value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new DocxParseError("word/document.xml melebihi batas ukuran pratinjau");
    }
    chunks.push(result.value);
    result = await reader.read();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  // Salinan ber-ArrayBuffer diperlukan karena sisi tulis DecompressionStream menerima BufferSource.
  // ReadableStream dibangun langsung dari bytes agar tidak bergantung pada Blob.stream().
  const source = new Uint8Array(data);
  const input = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(source);
      controller.close();
    },
  });
  const inflated = input.pipeThrough(new DecompressionStream("deflate-raw"));
  return readLimited(inflated, MAX_DOCUMENT_XML_BYTES);
}

// Nama elemen dicocokkan lewat namespace WordprocessingML, bukan prefiks "w:", karena prefiks
// tidak dijamin sama di setiap arsip.
function paragraphText(paragraph: Element): string {
  let text = "";
  const visit = (node: Element): void => {
    for (const child of Array.from(node.children)) {
      if (child.namespaceURI !== WORD_NAMESPACE) continue;
      const name = child.localName;
      // Paragraf bersarang (mis. kotak teks) diambil sebagai paragraf sendiri, dan properti
      // paragraf (pPr, rPr) bukan konten: tab di sana adalah definisi tab stop, bukan karakter tab.
      if (name === "p" || name === "pPr" || name === "rPr") continue;
      if (name === "t") {
        text += child.textContent ?? "";
      } else if (name === "tab") {
        text += "\t";
      } else if (name === "br" || name === "cr") {
        text += "\n";
      } else {
        visit(child);
      }
    }
  };
  visit(paragraph);
  return text;
}

// Pencarian paragraf memfilter semua elemen menurut namespace, bukan getElementsByTagNameNS, karena
// implementasi DOM di lingkungan uji (happy-dom) tidak mengembalikan hasil untuk dokumen XML.
function extractParagraphTexts(xml: string): string[] {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new DocxParseError("word/document.xml tidak dapat diurai");
  }
  return Array.from(document.getElementsByTagName("*"))
    .filter((element) => element.namespaceURI === WORD_NAMESPACE && element.localName === "p")
    .map(paragraphText);
}

// Paragraf kosong dibuang agar pratinjau tidak penuh spasi. Batas dihitung dalam karakter teks.
function collectParagraphs(texts: string[]): DocxPreviewText {
  const paragraphs: string[] = [];
  let used = 0;
  for (const raw of texts) {
    const text = raw.trim();
    if (text === "") continue;
    const room = DOCX_MAX_PREVIEW_CHARS - used;
    if (text.length > room) {
      if (room > 0) paragraphs.push(text.slice(0, room));
      return { paragraphs, truncated: true };
    }
    paragraphs.push(text);
    used += text.length;
  }
  return { paragraphs, truncated: false };
}

/**
 * Membaca teks paragraf dari blob DOCX. Melempar DocxParseError bila arsip rusak, metode kompresi
 * selain stored (0) dan deflate (8), word/document.xml tidak ada, atau XML tidak valid.
 * CRC32 tidak diverifikasi: integritas diuji oleh inflate dan parser XML.
 */
export async function readDocxText(blob: Blob): Promise<DocxPreviewText> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entry = findDocumentXmlEntry(bytes, view);
  assertReadable(entry);

  const data = readEntryData(bytes, view, entry);
  const xmlBytes = entry.method === METHOD_STORED ? data : await inflateRaw(data);
  const xml = new TextDecoder().decode(xmlBytes);
  return collectParagraphs(extractParagraphTexts(xml));
}
