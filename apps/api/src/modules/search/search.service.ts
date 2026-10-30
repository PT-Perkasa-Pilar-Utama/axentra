import type { PaginationMeta, SearchDocument, SearchDocumentsQuery } from "@axentra/shared";
import type { ISearchRepository } from "./search.repository";

export type SearchDocumentsResult = {
  items: ReadonlyArray<SearchDocument>;
  meta: PaginationMeta;
};

export type ISearchService = {
  searchDocuments(query: SearchDocumentsQuery): Promise<SearchDocumentsResult>;
};

export class SearchService implements ISearchService {
  public constructor(private readonly repository: ISearchRepository) {}

  public async searchDocuments(query: SearchDocumentsQuery): Promise<SearchDocumentsResult> {
    const result = await this.repository.searchDocuments(query);
    return {
      items: result.items,
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
      },
    };
  }
}

export function createSearchService(repository: ISearchRepository): SearchService {
  return new SearchService(repository);
}
