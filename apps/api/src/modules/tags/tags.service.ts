import type { TopTag, TopTagsQuery } from "@axentra/shared";
import type { TopTagsRepository } from "./tags.repository";

export type TopTagsService = {
  listTopTags: (query: TopTagsQuery) => Promise<ReadonlyArray<TopTag>>;
};

export function createTopTagsService(repository: TopTagsRepository): TopTagsService {
  return {
    async listTopTags(query: TopTagsQuery): Promise<ReadonlyArray<TopTag>> {
      if (query.context === "search" && (query.documentIds?.length ?? 0) === 0) {
        return [];
      }

      const [recentDocumentTags, popularTags] = await Promise.all([
        repository.listMostRecentDocumentTags(query),
        repository.listTopTags(query),
      ]);
      const selectedTags = new Map<string, TopTag>();

      for (const tag of recentDocumentTags) {
        selectedTags.set(tag.id, tag);
      }
      for (const tag of popularTags) {
        if (!selectedTags.has(tag.id)) selectedTags.set(tag.id, tag);
      }

      return [...selectedTags.values()].slice(0, query.limit);
    },
  };
}
