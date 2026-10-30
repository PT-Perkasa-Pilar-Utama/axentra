import { describe, expect, it } from "bun:test";
import { NotFoundError } from "../../http/errors";
import { createDocumentService } from "./documents.service";
import { InMemoryDocumentSmartTagsRepository } from "./smart-tags.repository";

describe("DocumentService Smart Tags (Task BE-S2-01 / AC-04.02)", () => {
  const documentId = "11111111-1111-4111-8111-111111111111";

  it("throws NotFoundError when document does not exist", async () => {
    const smartTagsRepo = new InMemoryDocumentSmartTagsRepository();
    const service = createDocumentService({ smartTagsRepository: smartTagsRepo });

    await expect(service.getDocumentSmartTags("non-existent-doc")).rejects.toThrow(NotFoundError);
  });

  it("returns empty array when document exists but has no tags", async () => {
    const smartTagsRepo = new InMemoryDocumentSmartTagsRepository();
    smartTagsRepo.addDocument({
      id: documentId,
      title: "Document No Tags.pdf",
      processingStatus: "completed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const service = createDocumentService({ smartTagsRepository: smartTagsRepo });

    const tags = await service.getDocumentSmartTags(documentId);
    expect(tags).toEqual([]);
  });

  it("stores and retrieves smart tags for an existing document", async () => {
    const smartTagsRepo = new InMemoryDocumentSmartTagsRepository();
    smartTagsRepo.addDocument({
      id: documentId,
      title: "Document With Tags.pdf",
      processingStatus: "completed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const service = createDocumentService({ smartTagsRepository: smartTagsRepo });

    await service.storeSmartTags(documentId, ["finance", "reporting", "strategy", "overflow"]);

    const tags = await service.getDocumentSmartTags(documentId);
    expect(tags.length).toBe(3);
    expect(tags.map((t) => t.name)).toEqual(["finance", "reporting", "strategy"]);
  });
});
