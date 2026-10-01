import type { CategorySummary } from "@axentra/shared";
import type { ICategoriesRepository } from "./categories.repository";
import { InMemoryCategoriesRepository } from "./categories.repository";

export type ICategoriesService = {
  listCategories: () => Promise<ReadonlyArray<CategorySummary>>;
};

export class CategoriesService implements ICategoriesService {
  public constructor(private readonly repository: ICategoriesRepository) {}

  public async listCategories(): Promise<ReadonlyArray<CategorySummary>> {
    return this.repository.listCategories();
  }
}

export function createCategoriesService(
  repository?: ICategoriesRepository | undefined,
): CategoriesService {
  return new CategoriesService(repository ?? new InMemoryCategoriesRepository());
}
