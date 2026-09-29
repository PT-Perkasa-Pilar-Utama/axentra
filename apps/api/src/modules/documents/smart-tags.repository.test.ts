import { describe, expect, it } from "bun:test";
import { InMemoryDocumentSmartTagsRepository } from "./smart-tags.repository";

describe("InMemoryDocumentSmartTagsRepository", () => {
  const documentId = "11111111-1111-4111-8111-111111111111";

  it("finds document by id when present", async () => {
    const repo = new InMemoryDocumentSmartTagsRepository();
    repo.addDocument({
      id: documentId,
      title: "Test Document.pdf",
      processingStatus: "completed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const doc = await repo.findDocumentById(documentId);
    expect(doc).not.toBeNull();
    expect(doc?.id).toBe(documentId);
    expect(doc?.title).toBe("Test Document.pdf");
  });

  it("returns null when document is not found", async () => {
    const repo = new InMemoryDocumentSmartTagsRepository();
    const doc = await repo.findDocumentById("non-existent-id");
    expect(doc).toBeNull();
  });

  it("saves up to 3 smart tags and retrieves them for a document", async () => {
    const repo = new InMemoryDocumentSmartTagsRepository();
    repo.addDocument({
      id: documentId,
      title: "Financial Strategy.pdf",
      processingStatus: "completed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await repo.saveDocumentSmartTags(documentId, [
      "finance",
      "strategy",
      "reporting",
      "extra-tag", // Should be capped at 3
    ]);

    expect(saved.length).toBe(3);
    expect(saved.map((s) => s.name)).toEqual(["finance", "strategy", "reporting"]);

    const retrieved = await repo.findSmartTagsByDocumentId(documentId);
    expect(retrieved.length).toBe(3);
    expect(retrieved.map((s) => s.name)).toEqual(["finance", "strategy", "reporting"]);
    expect(retrieved[0]?.id).toBeDefined();
    expect(retrieved[0]?.createdAt).toBeDefined();
  });

  it("returns empty array when document has no tags", async () => {
    const repo = new InMemoryDocumentSmartTagsRepository();
    repo.addDocument({
      id: documentId,
      title: "Untagged Document.pdf",
      processingStatus: "completed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const tags = await repo.findSmartTagsByDocumentId(documentId);
    expect(tags).toEqual([]);
  });

  it("reuses existing tag IDs when same tag name is added across documents", async () => {
    const repo = new InMemoryDocumentSmartTagsRepository();
    const doc2Id = "22222222-2222-4222-8222-222222222222";

    const saved1 = await repo.saveDocumentSmartTags(documentId, ["finance"]);
    const saved2 = await repo.saveDocumentSmartTags(doc2Id, ["finance"]);

    expect(saved1[0]?.id).toBe(saved2[0]?.id);
  });
});
