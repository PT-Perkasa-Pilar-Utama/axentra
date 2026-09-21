import { describe, expect, it } from "bun:test";
import {
  InMemoryDocumentMetadataRepository,
  mapDocumentMetadataRow,
  parseRawMetadata,
} from "./metadata.repository";

describe("parseRawMetadata (Type Safety / F4)", () => {
  it("safely accepts valid object records", () => {
    const valid = { extractor: "ooxml", pageCount: 12, tags: ["report"] };
    expect(parseRawMetadata(valid)).toEqual(valid);
  });

  it("returns null for null and undefined", () => {
    expect(parseRawMetadata(null)).toBeNull();
    expect(parseRawMetadata(undefined)).toBeNull();
  });

  it("returns null for invalid JSONB shapes (arrays, primitives)", () => {
    expect(parseRawMetadata(["not", "an", "object"])).toBeNull();
    expect(parseRawMetadata("just a string")).toBeNull();
    expect(parseRawMetadata(12345)).toBeNull();
    expect(parseRawMetadata(true)).toBeNull();
  });
});

describe("mapDocumentMetadataRow (Type Safety / F4 & F8)", () => {
  it("safely parses invalid JSONB database rows without unsafe casting", () => {
    const rawRow = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      documentId: "11111111-1111-4111-8111-111111111111",
      author: "Penulis Valid",
      rawMetadata: "corrupted_string_instead_of_object", // invalid JSONB
      extractedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = mapDocumentMetadataRow(rawRow);

    expect(result).not.toBeNull();
    expect(result.author).toBe("Penulis Valid");
    // Invalid JSONB is safely parsed to null instead of unsafe cast pass-through
    expect(result.rawMetadata).toBeNull();
  });

  it("safely parses valid JSONB database rows", () => {
    const rawRow = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      documentId: "11111111-1111-4111-8111-111111111111",
      author: "Penulis Valid",
      rawMetadata: { pageCount: 5, software: "Office" },
      extractedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = mapDocumentMetadataRow(rawRow);

    expect(result).not.toBeNull();
    expect(result.rawMetadata).toEqual({ pageCount: 5, software: "Office" });
  });
});

describe("InMemoryDocumentMetadataRepository (Task BE-S1-05)", () => {
  it("manages document lifecycle and metadata retrieval", async () => {
    const repo = new InMemoryDocumentMetadataRepository();
    const docId = "11111111-1111-4111-8111-111111111111";

    // Initially not found
    expect(await repo.findDocumentById(docId)).toBeNull();
    expect(await repo.findMetadataByDocumentId(docId)).toBeNull();

    // Add document
    repo.addDocument({
      id: docId,
      title: "Laporan Riset.pdf",
      processingStatus: "completed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const doc = await repo.findDocumentById(docId);
    expect(doc).not.toBeNull();
    expect(doc?.title).toBe("Laporan Riset.pdf");

    // Save initial metadata
    const saved = await repo.saveMetadata({
      documentId: docId,
      author: "Dr. Sumitro",
      rawMetadata: { pageCount: 10 },
      extractedAt: new Date("2026-09-21T10:00:00.000Z"),
    });

    expect(saved.id).toBeDefined();
    expect(saved.documentId).toBe(docId);
    expect(saved.author).toBe("Dr. Sumitro");
    expect(saved.rawMetadata).toEqual({ pageCount: 10 });
    expect(saved.extractedAt).toEqual(new Date("2026-09-21T10:00:00.000Z"));

    // Find saved metadata
    const fetched = await repo.findMetadataByDocumentId(docId);
    expect(fetched).not.toBeNull();
    expect(fetched?.author).toBe("Dr. Sumitro");

    // Update metadata for the same document (upsert behavior)
    const updated = await repo.saveMetadata({
      documentId: docId,
      author: "Prof. Sumitro, Ph.D.",
      rawMetadata: { pageCount: 10, verified: true },
    });

    expect(updated.id).toBe(saved.id);
    expect(updated.author).toBe("Prof. Sumitro, Ph.D.");

    const reFetched = await repo.findMetadataByDocumentId(docId);
    expect(reFetched?.author).toBe("Prof. Sumitro, Ph.D.");
  });
});
