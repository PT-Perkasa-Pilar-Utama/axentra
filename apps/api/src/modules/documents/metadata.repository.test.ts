import { describe, expect, it } from "bun:test";
import { InMemoryDocumentMetadataRepository } from "./metadata.repository";

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
