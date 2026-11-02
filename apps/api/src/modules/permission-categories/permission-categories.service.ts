import type { PermissionCategory } from "@axentra/shared";
import type { IPermissionCategoriesRepository } from "./permission-categories.repository";
import { InMemoryPermissionCategoriesRepository } from "./permission-categories.repository";

export type IPermissionCategoriesService = {
  listPermissionCategories: (limit?: number) => Promise<ReadonlyArray<PermissionCategory>>;
};

export class PermissionCategoriesService implements IPermissionCategoriesService {
  public constructor(private readonly repository: IPermissionCategoriesRepository) {}

  public async listPermissionCategories(
    limit?: number,
  ): Promise<ReadonlyArray<PermissionCategory>> {
    return this.repository.listPermissionCategories(limit);
  }
}

export function createPermissionCategoriesService(
  repository?: IPermissionCategoriesRepository | undefined,
): PermissionCategoriesService {
  return new PermissionCategoriesService(
    repository ?? new InMemoryPermissionCategoriesRepository(),
  );
}
