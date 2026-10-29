import { describe, expect, test } from "bun:test";
import {
  DOCX_MAX_PREVIEW_CHARS,
  DocxParseError,
  readDocxText,
} from "../src/features/document-detail/docx-text";
import { buildDocx, buildZip, documentXml, paragraphXml } from "./docx-fixture";

const encoder = new TextEncoder();

function asBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.slice()]);
}

const sampleBody = [
  paragraphXml("Kontrak"),
  "<w:p><w:r><w:t>Pasal 1</w:t><w:tab/><w:t>Ketentuan</w:t></w:r></w:p>",
  "<w:p><w:r><w:t>Baris satu</w:t><w:br/><w:t>Baris dua</w:t></w:r></w:p>",
  // Definisi tab stop di pPr bukan karakter tab, dan paragraf kosong tidak ikut.
  '<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr></w:p>',
  // Teks yang dihapus (w:delText) tidak termasuk pratinjau.
  "<w:p><w:r><w:delText>dihapus</w:delText></w:r></w:p>",
].join("");

const expectedParagraphs = ["Kontrak", "Pasal 1\tKetentuan", "Baris satu\nBaris dua"];

describe("readDocxText: arsip deflate dan stored", () => {
  test("mengambil teks per paragraf dengan tab dan baris baru dari word/document.xml", async () => {
    const result = await readDocxText(asBlob(buildDocx(sampleBody)));

    expect(result).toEqual({ paragraphs: expectedParagraphs, truncated: false });
  });

  test("membaca entri stored (metode 0) tanpa dekompresi", async () => {
    const result = await readDocxText(asBlob(buildDocx(sampleBody, { method: 0 })));

    expect(result.paragraphs).toEqual(expectedParagraphs);
  });

  test("mencocokkan elemen lewat namespace WordprocessingML, bukan prefiks w:", async () => {
    const result = await readDocxText(
      asBlob(buildDocx(paragraphXml("Halo dunia", "x"), { prefix: "x" })),
    );

    expect(result.paragraphs).toEqual(["Halo dunia"]);
  });

  test("dokumen tanpa teks menghasilkan daftar paragraf kosong", async () => {
    const result = await readDocxText(
      asBlob(buildDocx('<w:p/><w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p>')),
    );

    expect(result).toEqual({ paragraphs: [], truncated: false });
  });

  test("teks dipotong tepat pada batas karakter dan ditandai truncated", async () => {
    const long = "a".repeat(120_000);
    const body = [paragraphXml(long), paragraphXml(long), paragraphXml("tidak ikut")].join("");

    const result = await readDocxText(asBlob(buildDocx(body)));

    expect(result.truncated).toBe(true);
    const total = result.paragraphs.reduce((sum, text) => sum + text.length, 0);
    expect(total).toBe(DOCX_MAX_PREVIEW_CHARS);
    expect(result.paragraphs).toHaveLength(2);
  });
});

describe("readDocxText: arsip rusak atau tidak didukung", () => {
  test("arsip yang bukan zip melempar DocxParseError", async () => {
    const notZip = encoder.encode("ini bukan arsip DOCX sama sekali");

    await expect(readDocxText(asBlob(notZip))).rejects.toBeInstanceOf(DocxParseError);
  });

  test("arsip terpotong melempar DocxParseError", async () => {
    const full = buildDocx(sampleBody);
    const truncated = full.slice(0, full.length - 30);

    await expect(readDocxText(asBlob(truncated))).rejects.toBeInstanceOf(DocxParseError);
  });

  test("metode kompresi selain 0 dan 8 ditolak", async () => {
    const unsupported = buildZip([
      { name: "word/document.xml", data: encoder.encode(documentXml(sampleBody)), method: 12 },
    ]);

    const error = await readDocxText(asBlob(unsupported)).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DocxParseError);
    expect((error as DocxParseError).message).toContain("tidak didukung");
  });

  test("arsip tanpa word/document.xml ditolak", async () => {
    const missing = buildZip([{ name: "word/styles.xml", data: encoder.encode("<styles/>") }]);

    await expect(readDocxText(asBlob(missing))).rejects.toBeInstanceOf(DocxParseError);
  });

  test("XML word/document.xml yang tidak valid ditolak", async () => {
    const broken = buildZip([
      { name: "word/document.xml", data: encoder.encode("<w:document><w:body><w:p>") },
    ]);

    await expect(readDocxText(asBlob(broken))).rejects.toBeInstanceOf(DocxParseError);
  });
});
