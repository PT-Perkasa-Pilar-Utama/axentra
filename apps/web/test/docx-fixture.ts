import { deflateRawSync } from "node:zlib";

// Pembangun arsip zip minimal untuk tes DOCX: header lokal, central directory, dan EOCD.
// Parser produksi tidak memverifikasi CRC32, jadi CRC dibiarkan 0.

export type FixtureEntry = {
  name: string;
  data: Uint8Array;
  /** Metode kompresi di header. 0 = stored, 8 = deflate; nilai lain untuk menguji penolakan. */
  method?: number;
};

const encoder = new TextEncoder();
const DEFLATE = 8;

function fixedHeader(size: number, fill: (view: DataView) => void): Uint8Array {
  const bytes = new Uint8Array(size);
  fill(new DataView(bytes.buffer));
  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function buildZip(entries: FixtureEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localSize = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const method = entry.method ?? DEFLATE;
    const payload = method === DEFLATE ? new Uint8Array(deflateRawSync(entry.data)) : entry.data;

    const local = fixedHeader(30 + name.length, (view) => {
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(8, method, true);
      view.setUint32(18, payload.length, true);
      view.setUint32(22, entry.data.length, true);
      view.setUint16(26, name.length, true);
    });
    local.set(name, 30);

    const central = fixedHeader(46 + name.length, (view) => {
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(10, method, true);
      view.setUint32(20, payload.length, true);
      view.setUint32(24, entry.data.length, true);
      view.setUint16(28, name.length, true);
      view.setUint32(42, localSize, true);
    });
    central.set(name, 46);

    localParts.push(local, payload);
    centralParts.push(central);
    localSize += local.length + payload.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = fixedHeader(22, (view) => {
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, entries.length, true);
    view.setUint16(10, entries.length, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, localSize, true);
  });
  return concat([...localParts, ...centralParts, end]);
}

function escapeXml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function paragraphXml(text: string, prefix = "w"): string {
  return `<${prefix}:p><${prefix}:r><${prefix}:t xml:space="preserve">${escapeXml(text)}</${prefix}:t></${prefix}:r></${prefix}:p>`;
}

export function documentXml(bodyXml: string, prefix = "w"): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<${prefix}:document xmlns:${prefix}="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`,
    `<${prefix}:body>${bodyXml}</${prefix}:body>`,
    `</${prefix}:document>`,
  ].join("");
}

/** DOCX minimal: hanya word/document.xml yang dibaca oleh pratinjau. */
export function buildDocx(
  bodyXml: string,
  options?: { prefix?: string; method?: number },
): Uint8Array {
  const xml = documentXml(bodyXml, options?.prefix ?? "w");
  return buildZip([
    {
      name: "word/document.xml",
      data: encoder.encode(xml),
      ...(options?.method !== undefined ? { method: options.method } : {}),
    },
  ]);
}
