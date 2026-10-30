import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CategorySummary, DocumentDetail, SmartTag } from "@axentra/shared";
import { deriveDocumentDetailFields } from "../src/features/document-detail/document-detail-fields.presenter";
import { DocumentDetailView } from "../src/features/document-detail/document-detail.view";

const documentId = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const uploadedAt = "2026-09-25T12:00:00.000Z";

function smartTag(index: number, name: string): SmartTag {
  return {
    id: `00000000-0000-4000-8000-00000000000${index}`,
    name,
    createdAt: uploadedAt,
  };
}

function category(name: string): CategorySummary {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    name,
    slug: name.toLowerCase(),
    downloadEnabled: false,
    createdAt: uploadedAt,
    updatedAt: uploadedAt,
  };
}

function detailWith(overrides: Partial<DocumentDetail>): DocumentDetail {
  return {
    id: documentId,
    title: "laporan.pdf",
    processingStatus: "completed",
    category: null,
    tags: [],
    // Tanggal ekstraksi metadata berbeda dari tanggal unggah; tes memastikan yang kedua dipakai.
    metadata: { author: "Bessie Cooper", extractedAt: "2025-12-16T10:05:00.000Z" },
    canDownload: true,
    createdAt: uploadedAt,
    updatedAt: uploadedAt,
    ...overrides,
  };
}

function renderDetail(detail: DocumentDetail): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["document-detail", documentId], detail);
  return renderToString(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        { initialEntries: [`/documents/${documentId}`] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: "/documents/:id",
            element: createElement(DocumentDetailView),
          }),
        ),
      ),
    ),
  );
}

describe("Document detail metadata fields (AC-04.02, AC-05.01, AC-07.01)", () => {
  test("AC-04.02: shows at most three smart tags on the detail page", () => {
    const html = renderDetail(
      detailWith({ tags: [smartTag(1, "Alpha"), smartTag(2, "Beta"), smartTag(3, "Gamma")] }),
    );

    expect(html).toContain('aria-label="Smart Tags"');
    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");
    expect(html).toContain("Gamma");
    expect(html).not.toContain("Belum tersedia");
  });

  test("AC-04.02: a fourth tag from the response never renders", () => {
    const html = renderDetail(
      detailWith({
        tags: [
          smartTag(1, "Alpha"),
          smartTag(2, "Beta"),
          smartTag(3, "Gamma"),
          smartTag(4, "Delta"),
        ],
      }),
    );

    expect(html).toContain("Gamma");
    expect(html).not.toContain("Delta");
  });

  test("AC-04.02: the tag limit is applied by the field derivation itself", () => {
    const fields = deriveDocumentDetailFields(
      detailWith({
        tags: [
          smartTag(1, "Alpha"),
          smartTag(2, "Beta"),
          smartTag(3, "Gamma"),
          smartTag(4, "Delta"),
        ],
      }),
    );

    expect(fields.tags.status).toBe("ready");
    expect(fields.tags.names).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  test("AC-05.01: shows the category name from the detail response", () => {
    const html = renderDetail(detailWith({ category: category("Reporting") }));

    expect(html).toContain("Reporting");
    expect(html).not.toContain("Tidak ada kategori");
    expect(html).not.toContain("Belum tersedia");
  });

  test("Tanggal unggah uses the document createdAt, not the metadata extraction timestamp", () => {
    const html = renderDetail(detailWith({}));

    expect(html).toContain("25/09/2026");
    expect(html).not.toContain("16/12/2025");
    expect(html).not.toContain("Memuat tanggal...");
    expect(html).not.toContain("Tidak tersedia");
  });

  test("Tanggal unggah shows the date of an older document outside any recent list", () => {
    const html = renderDetail(
      detailWith({
        createdAt: "2019-03-04T08:00:00.000Z",
        updatedAt: "2019-03-04T08:00:00.000Z",
      }),
    );

    expect(html).toContain("04/03/2019");
    expect(html).not.toContain("Tidak tersedia");
  });

  test("shows explicit empty states for a document without tags or category", () => {
    const html = renderDetail(detailWith({ tags: [], category: null }));

    expect(html).toContain("Tidak ada tag");
    expect(html).toContain("Tidak ada kategori");
  });

  test("AC-07.01: Dokumen Terkait appears only for a document with at least one tag", () => {
    const tagged = renderDetail(detailWith({ tags: [smartTag(1, "Strategy")] }));
    const untagged = renderDetail(detailWith({ tags: [] }));

    expect(tagged).toContain("Dokumen Terkait");
    expect(untagged).not.toContain("Dokumen Terkait");
  });

  test("category and tags are empty when the response omits them", () => {
    const fields = deriveDocumentDetailFields(detailWith({ tags: undefined, category: undefined }));

    expect(fields.tags).toEqual({ status: "empty", names: [] });
    expect(fields.category).toEqual({ status: "empty", name: null });
  });
});
