import { describe, expect, it } from "bun:test";
import { documents } from "@axentra/db";
import type { SearchDocument, SearchDocumentsQuery } from "@axentra/shared";
import { PgDialect } from "drizzle-orm/pg-core";
import { containsLikePattern, escapeLikePattern, ilikeContains } from "./search.like";
import { InMemorySearchRepository } from "./search.repository";

const dialect = new PgDialect();

const percentDocument: SearchDocument = {
  id: "11111111-1111-4111-8111-111111111111",
  filename: "laporan 100%.pdf",
  processingStatus: "completed",
  createdAt: "2026-09-22T02:00:00.000Z",
  snippet: null,
};

const underscoreDocument: SearchDocument = {
  id: "22222222-2222-4222-8222-222222222222",
  filename: "anggaran_2026.pdf",
  processingStatus: "completed",
  createdAt: "2026-09-23T02:00:00.000Z",
  snippet: null,
};

const backslashDocument: SearchDocument = {
  id: "33333333-3333-4333-8333-333333333333",
  filename: "arsip\\final.pdf",
  processingStatus: "completed",
  createdAt: "2026-09-24T02:00:00.000Z",
  snippet: null,
};

const plainDocument: SearchDocument = {
  id: "44444444-4444-4444-8444-444444444444",
  filename: "laporan-tahunan.pdf",
  processingStatus: "completed",
  createdAt: "2026-09-25T02:00:00.000Z",
  snippet: null,
};

function searchFor(q: string): Promise<{ filenames: string[]; total: number }> {
  const repository = new InMemorySearchRepository();
  repository.addDocument(percentDocument);
  repository.addDocument(underscoreDocument);
  repository.addDocument(backslashDocument);
  repository.addDocument(plainDocument);
  const query: SearchDocumentsQuery = { q, page: 1, limit: 20 };
  return repository.searchDocuments(query).then((result) => ({
    filenames: result.items.map((item) => item.filename),
    total: result.total,
  }));
}

describe("LIKE escaping for document search (B3)", () => {
  it("escapes percent, underscore, and backslash with a backslash prefix", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("C:\\arsip")).toBe("C:\\\\arsip");
  });

  it("leaves ordinary search terms unchanged inside a contains pattern", () => {
    expect(containsLikePattern("API")).toBe("%API%");
    expect(containsLikePattern("%")).toBe("%\\%%");
  });

  it("renders ILIKE with an explicit ESCAPE backslash and the escaped pattern as the parameter", () => {
    const rendered = dialect.sqlToQuery(ilikeContains(documents.title, "%"));

    expect(rendered.sql).toMatch(/ ilike \$1 escape '\\'$/);
    expect(rendered.params).toEqual(["%\\%%"]);
  });

  it("matches a lone percent sign only where the text contains a percent sign", async () => {
    const result = await searchFor("%");

    expect(result.filenames).toEqual(["laporan 100%.pdf"]);
    expect(result.total).toBe(1);
  });

  it("matches underscore literally, not as a single-character wildcard", async () => {
    const result = await searchFor("_");

    expect(result.filenames).toEqual(["anggaran_2026.pdf"]);
  });

  it("matches backslash literally", async () => {
    const result = await searchFor("\\");

    expect(result.filenames).toEqual(["arsip\\final.pdf"]);
  });

  it("still matches ordinary terms case-insensitively", async () => {
    const result = await searchFor("LAPORAN");

    expect(result.filenames).toEqual(["laporan 100%.pdf", "laporan-tahunan.pdf"]);
    expect(result.total).toBe(2);
  });
});
