import type { CategorySummary } from "@axentra/shared";
import type { ICategoriesRepository } from "./categories.repository";
import { InMemoryCategoriesRepository } from "./categories.repository";

export type ICategoriesService = {
  listCategories: (limit?: number) => Promise<ReadonlyArray<CategorySummary>>;
};

export class CategoriesService implements ICategoriesService {
  public constructor(private readonly repository: ICategoriesRepository) {}

  public async listCategories(limit?: number): Promise<ReadonlyArray<CategorySummary>> {
    return this.repository.listCategories(limit);
  }
}

export function createCategoriesService(
  repository?: ICategoriesRepository | undefined,
): CategoriesService {
  return new CategoriesService(repository ?? new InMemoryCategoriesRepository());
}
